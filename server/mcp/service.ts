import { createHash, randomBytes } from 'node:crypto'
import { and, count, desc, eq, gt, gte, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
    auditEvents,
    mcpActionReceipts,
    mcpClients,
    mcpConfirmations,
    preferences,
} from '../db/schema.js'
import type * as schemaType from '../db/schema.js'

type Database = PostgresJsDatabase<typeof schemaType>

export type McpClient = {
    id: string
    name: string
    scopes: string[]
    dateFrom: Date | null
    dateTo: Date | null
    expiresAt: Date
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export class McpAccessService {
    constructor(private readonly database: Database) {}

    private async clientIsActive(id: string) {
        const [client] = await this.database
            .select({ id: mcpClients.id })
            .from(mcpClients)
            .where(
                and(
                    eq(mcpClients.id, id),
                    isNull(mcpClients.revokedAt),
                    gt(mcpClients.expiresAt, new Date()),
                ),
            )
            .limit(1)
        return Boolean(client)
    }

    async enabled() {
        const [record] = await this.database
            .select({ enabled: preferences.mcpEnabled })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
            .limit(1)
        return record?.enabled ?? false
    }

    async setEnabled(enabled: boolean) {
        await this.database
            .insert(preferences)
            .values({ id: 'owner', mcpEnabled: enabled })
            .onConflictDoUpdate({
                target: preferences.id,
                set: { mcpEnabled: enabled, updatedAt: new Date() },
            })
        await this.audit('owner', 'mcp.permission.changed', 'mcp', 'endpoint', { enabled })
    }

    async issue(input: {
        name: string
        scopes: string[]
        dateFrom?: string
        dateTo?: string
        expiresAt: string
    }) {
        const token = `trk_mcp_${randomBytes(32).toString('base64url')}`
        const [client] = await this.database
            .insert(mcpClients)
            .values({
                name: input.name,
                tokenHash: tokenHash(token),
                scopes: input.scopes,
                dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
                dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
                expiresAt: new Date(input.expiresAt),
            })
            .returning()
        await this.audit('owner', 'mcp.client.created', 'mcp_client', client.id, {
            scopes: input.scopes,
            expiresAt: input.expiresAt,
        })
        return { client, token }
    }

    async authenticate(token?: string): Promise<McpClient | null> {
        if (!token || !(await this.enabled())) return null
        const [client] = await this.database
            .select()
            .from(mcpClients)
            .where(
                and(
                    eq(mcpClients.tokenHash, tokenHash(token)),
                    isNull(mcpClients.revokedAt),
                    gt(mcpClients.expiresAt, new Date()),
                ),
            )
            .limit(1)
        if (!client) return null
        await this.database
            .update(mcpClients)
            .set({ lastUsedAt: new Date() })
            .where(eq(mcpClients.id, client.id))
        return { ...client, scopes: client.scopes as string[] }
    }

    list() {
        return this.database
            .select({
                id: mcpClients.id,
                name: mcpClients.name,
                scopes: mcpClients.scopes,
                dateFrom: mcpClients.dateFrom,
                dateTo: mcpClients.dateTo,
                expiresAt: mcpClients.expiresAt,
                revokedAt: mcpClients.revokedAt,
                lastUsedAt: mcpClients.lastUsedAt,
                createdAt: mcpClients.createdAt,
            })
            .from(mcpClients)
            .orderBy(desc(mcpClients.createdAt))
    }

    listAccessEvents() {
        return this.database
            .select({
                id: auditEvents.id,
                actor: auditEvents.actor,
                action: auditEvents.action,
                targetId: auditEvents.targetId,
                createdAt: auditEvents.createdAt,
            })
            .from(auditEvents)
            .where(eq(auditEvents.action, 'mcp.request'))
            .orderBy(desc(auditEvents.createdAt))
            .limit(100)
    }

    async revoke(id: string) {
        await this.database
            .update(mcpClients)
            .set({ revokedAt: new Date() })
            .where(eq(mcpClients.id, id))
        await this.audit('owner', 'mcp.client.revoked', 'mcp_client', id)
    }

    async auditRequest(client: McpClient, tool: string) {
        await this.audit(`mcp:${client.id}`, 'mcp.request', 'mcp_tool', tool, {
            clientId: client.id,
            tool,
        })
    }

    async withinQuota(client: McpClient, tool: string, maximum = 60) {
        const [result] = await this.database
            .select({ value: count() })
            .from(auditEvents)
            .where(
                and(
                    eq(auditEvents.actor, `mcp:${client.id}`),
                    eq(auditEvents.targetType, 'mcp_tool'),
                    eq(auditEvents.targetId, tool),
                    gte(auditEvents.createdAt, new Date(Date.now() - 60_000)),
                ),
            )
        return result.value < maximum
    }

    async runIdempotent<T>(
        client: McpClient,
        tool: string,
        idempotencyKey: string,
        operation: (transaction: Database) => Promise<T>,
    ): Promise<{ result: T; duplicate: boolean }> {
        if (!(await this.clientIsActive(client.id))) throw new Error('inactive_mcp_client')
        return this.database.transaction(async transaction => {
            const [claim] = await transaction
                .insert(mcpActionReceipts)
                .values({
                    clientId: client.id,
                    tool,
                    idempotencyKey,
                    result: { state: 'in_progress' },
                })
                .onConflictDoNothing()
                .returning({ id: mcpActionReceipts.id })

            if (!claim) {
                const [existing] = await transaction
                    .select({ result: mcpActionReceipts.result })
                    .from(mcpActionReceipts)
                    .where(
                        and(
                            eq(mcpActionReceipts.clientId, client.id),
                            eq(mcpActionReceipts.tool, tool),
                            eq(mcpActionReceipts.idempotencyKey, idempotencyKey),
                        ),
                    )
                    .limit(1)
                if (!existing || (existing.result as { state?: string }).state === 'in_progress') {
                    throw new Error('idempotency_claim_incomplete')
                }
                return { result: existing.result as T, duplicate: true }
            }

            const result = await operation(transaction as Database)
            await transaction
                .update(mcpActionReceipts)
                .set({ result: result as object })
                .where(eq(mcpActionReceipts.id, claim.id))
            return { result, duplicate: false }
        })
    }

    async issueConfirmation(
        client: McpClient,
        action: string,
        targetId: string,
        payload?: unknown,
    ) {
        if (!(await this.clientIsActive(client.id))) throw new Error('inactive_mcp_client')
        const token = randomBytes(24).toString('base64url')
        const payloadHash = payload === undefined ? undefined : tokenHash(JSON.stringify(payload))
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
        await this.database.insert(mcpConfirmations).values({
            tokenHash: tokenHash(token),
            clientId: client.id,
            action,
            targetId,
            payloadHash,
            expiresAt,
        })
        return { token, expiresAt }
    }

    async consumeConfirmation(
        client: McpClient,
        token: string,
        action: string,
        targetId: string,
        payload?: unknown,
    ) {
        if (!(await this.clientIsActive(client.id))) return false
        const payloadHash = payload === undefined ? null : tokenHash(JSON.stringify(payload))
        const [confirmation] = await this.database
            .update(mcpConfirmations)
            .set({ consumedAt: new Date() })
            .where(
                and(
                    eq(mcpConfirmations.tokenHash, tokenHash(token)),
                    eq(mcpConfirmations.clientId, client.id),
                    eq(mcpConfirmations.action, action),
                    eq(mcpConfirmations.targetId, targetId),
                    payloadHash === null
                        ? isNull(mcpConfirmations.payloadHash)
                        : eq(mcpConfirmations.payloadHash, payloadHash),
                    isNull(mcpConfirmations.consumedAt),
                    gt(mcpConfirmations.expiresAt, new Date()),
                ),
            )
            .returning({ tokenHash: mcpConfirmations.tokenHash })
        return Boolean(confirmation)
    }

    private async audit(
        actor: string,
        action: string,
        targetType: string,
        targetId: string,
        metadata: Record<string, unknown> = {},
    ) {
        await this.database
            .insert(auditEvents)
            .values({ actor, action, targetType, targetId, metadata })
    }
}
