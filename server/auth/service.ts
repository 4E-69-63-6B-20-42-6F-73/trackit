import { createHash, randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type {
    AuthenticationResponseJSON,
    AuthenticatorTransportFuture,
    RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { authChallenges, auditEvents, owners, passkeys, sessions } from '../db/schema.js'
import { config } from '../config.js'

type Database = PostgresJsDatabase<typeof schemaType>
type SessionContext = { userAgent?: string; ipAddress?: string }

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const token = () => randomBytes(32).toString('base64url')
const recoveryCode = () => randomBytes(6).toString('hex').toUpperCase()
const relyingParty = new URL(config.WEB_ORIGIN)

export class AuthService {
    constructor(private readonly database: Database) {}

    async configured() {
        return (await this.database.select({ id: owners.id }).from(owners).limit(1)).length > 0
    }

    async setup(password: string, context: SessionContext) {
        if (await this.configured()) throw new Error('already_configured')
        const recoveryCodes = Array.from({ length: 8 }, recoveryCode)
        await this.database.insert(owners).values({
            id: 'owner',
            passwordHash: await hash(password),
            recoveryCodeHashes: recoveryCodes.map(digest),
        })
        const session = await this.issueSession(context)
        await this.audit('owner', 'owner.setup', 'owner', 'owner')
        return { session, recoveryCodes }
    }

    async login(password: string, context: SessionContext) {
        const [owner] = await this.database.select().from(owners).limit(1)
        if (!owner || !(await verify(owner.passwordHash, password))) return null
        const session = await this.issueSession(context)
        await this.audit('owner', 'auth.login', 'session', session.id)
        return session
    }

    async recover(code: string, context: SessionContext) {
        const [owner] = await this.database.select().from(owners).limit(1)
        if (!owner) return null
        const hashes = owner.recoveryCodeHashes as string[]
        const codeHash = digest(code.trim().toUpperCase())
        if (!hashes.includes(codeHash)) return null
        await this.database
            .update(owners)
            .set({ recoveryCodeHashes: hashes.filter(item => item !== codeHash) })
            .where(eq(owners.id, 'owner'))
        const session = await this.issueSession(context)
        await this.audit('owner', 'auth.recovery_login', 'session', session.id)
        return session
    }

    async registrationOptions() {
        const credentials = await this.database.select().from(passkeys)
        const options = await generateRegistrationOptions({
            rpName: 'TrackIt',
            rpID: relyingParty.hostname,
            userName: 'owner',
            userDisplayName: 'TrackIt Owner',
            attestationType: 'none',
            excludeCredentials: credentials.map(item => ({
                id: item.credentialId,
                transports: item.transports as AuthenticatorTransportFuture[],
            })),
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'required',
            },
        })
        await this.saveChallenge('registration', options.challenge)
        return options
    }

    async registerPasskey(response: RegistrationResponseJSON) {
        const challenge = await this.challenge('registration')
        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge: challenge,
            expectedOrigin: relyingParty.origin,
            expectedRPID: relyingParty.hostname,
            requireUserVerification: true,
        })
        if (!verification.verified) return false
        const info = verification.registrationInfo
        await this.database
            .insert(passkeys)
            .values({
                credentialId: info.credential.id,
                publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
                counter: info.credential.counter,
                transports: info.credential.transports ?? [],
                deviceType: info.credentialDeviceType,
                backedUp: info.credentialBackedUp,
            })
            .onConflictDoNothing()
        await this.audit('owner', 'passkey.register', 'passkey', info.credential.id)
        return true
    }

    async authenticationOptions() {
        const credentials = await this.database.select().from(passkeys)
        const options = await generateAuthenticationOptions({
            rpID: relyingParty.hostname,
            userVerification: 'required',
            allowCredentials: credentials.map(item => ({
                id: item.credentialId,
                transports: item.transports as AuthenticatorTransportFuture[],
            })),
        })
        await this.saveChallenge('authentication', options.challenge)
        return options
    }

    async authenticatePasskey(response: AuthenticationResponseJSON, context: SessionContext) {
        const [credential] = await this.database
            .select()
            .from(passkeys)
            .where(eq(passkeys.credentialId, response.id))
            .limit(1)
        if (!credential) return null
        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: await this.challenge('authentication'),
            expectedOrigin: relyingParty.origin,
            expectedRPID: relyingParty.hostname,
            requireUserVerification: true,
            credential: {
                id: credential.credentialId,
                publicKey: Buffer.from(credential.publicKey, 'base64url'),
                counter: credential.counter,
                transports: credential.transports as AuthenticatorTransportFuture[],
            },
        })
        if (!verification.verified) return null
        await this.database
            .update(passkeys)
            .set({ counter: verification.authenticationInfo.newCounter })
            .where(eq(passkeys.credentialId, credential.credentialId))
        const session = await this.issueSession(context)
        await this.audit('owner', 'auth.passkey_login', 'session', session.id)
        return session
    }

    async authenticate(rawToken: string | undefined) {
        if (!rawToken) return null
        const [session] = await this.database
            .select()
            .from(sessions)
            .where(
                and(
                    eq(sessions.tokenHash, digest(rawToken)),
                    isNull(sessions.revokedAt),
                    gt(sessions.expiresAt, new Date()),
                ),
            )
            .limit(1)
        return session ?? null
    }

    async revoke(rawToken: string | undefined) {
        if (!rawToken) return
        const [revoked] = await this.database
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(eq(sessions.tokenHash, digest(rawToken)))
            .returning({ id: sessions.id })
        await this.audit('owner', 'auth.logout', 'session', revoked?.id ?? 'unknown')
    }

    async revokeAll() {
        await this.database
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(isNull(sessions.revokedAt))
        await this.audit('owner', 'auth.logout_all', 'sessions', 'all')
    }

    listSessions() {
        return this.database
            .select({
                id: sessions.id,
                userAgent: sessions.userAgent,
                ipAddress: sessions.ipAddress,
                createdAt: sessions.createdAt,
                expiresAt: sessions.expiresAt,
            })
            .from(sessions)
            .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
            .orderBy(desc(sessions.createdAt))
    }

    async revokeSession(id: string) {
        await this.database
            .update(sessions)
            .set({ revokedAt: new Date() })
            .where(eq(sessions.id, id))
        await this.audit('owner', 'auth.session_revoke', 'session', id)
    }

    listAuditEvents() {
        return this.database
            .select({
                id: auditEvents.id,
                actor: auditEvents.actor,
                action: auditEvents.action,
                targetType: auditEvents.targetType,
                targetId: auditEvents.targetId,
                createdAt: auditEvents.createdAt,
            })
            .from(auditEvents)
            .orderBy(desc(auditEvents.createdAt))
            .limit(100)
    }

    recordAudit(action: string, targetType?: string, targetId?: string) {
        return this.audit('owner', action, targetType, targetId)
    }

    private async issueSession(context: SessionContext) {
        const rawToken = token()
        const [record] = await this.database
            .insert(sessions)
            .values({
                tokenHash: digest(rawToken),
                userAgent: context.userAgent,
                ipAddress: context.ipAddress,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            })
            .returning({ id: sessions.id, expiresAt: sessions.expiresAt })
        return { ...record, token: rawToken }
    }

    private async audit(actor: string, action: string, targetType?: string, targetId?: string) {
        await this.database.insert(auditEvents).values({ actor, action, targetType, targetId })
    }

    private async saveChallenge(kind: string, challenge: string) {
        await this.database
            .insert(authChallenges)
            .values({ kind, challenge, expiresAt: new Date(Date.now() + 5 * 60 * 1000) })
            .onConflictDoUpdate({
                target: authChallenges.kind,
                set: { challenge, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
            })
    }

    private async challenge(kind: string) {
        const [record] = await this.database
            .select()
            .from(authChallenges)
            .where(and(eq(authChallenges.kind, kind), gt(authChallenges.expiresAt, new Date())))
            .limit(1)
        if (!record) throw new Error('challenge_expired')
        return record.challenge
    }
}
