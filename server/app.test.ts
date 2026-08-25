import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import type {
    CreateJournalEntry,
    JournalEntry,
    JournalListQuery,
    JournalRepository,
    UpdateJournalEntry,
} from './journal/types.js'

class MemoryJournalRepository implements JournalRepository {
    entries: JournalEntry[] = []
    lastListQuery: JournalListQuery | undefined

    async list(query?: JournalListQuery) {
        this.lastListQuery = query
        return this.entries
    }

    async create(input: CreateJournalEntry) {
        const now = new Date().toISOString()
        const entry: JournalEntry = {
            ...input,
            id: input.id ?? randomUUID(),
            version: 1,
            createdAt: now,
            updatedAt: now,
        }
        const existing = this.entries.findIndex(item => item.id === entry.id)
        if (existing >= 0) this.entries[existing] = entry
        else this.entries.unshift(entry)
        return entry
    }

    async remove(id: string) {
        const before = this.entries.length
        this.entries = this.entries.filter(entry => entry.id !== id)
        return this.entries.length !== before
    }

    async update(id: string, input: UpdateJournalEntry) {
        const index = this.entries.findIndex(
            entry => entry.id === id && entry.version === input.version,
        )
        if (index < 0) return null
        this.entries[index] = {
            ...this.entries[index],
            ...input,
            version: input.version + 1,
            updatedAt: new Date().toISOString(),
        }
        return this.entries[index]
    }

    async ready() {
        return true
    }
}

describe('device authentication diagnostics', () => {
    it('authenticates the exact raw JSON bytes instead of reserialized numeric values', async () => {
        const authenticateDetailed = vi.fn().mockResolvedValue({ device: { id: 'device-1' } })
        const uploadHealthRecords = vi.fn().mockResolvedValue({ accepted: 1, duplicate: false })
        const app = await createApp(new MemoryJournalRepository(), {
            devices: { authenticateDetailed, uploadHealthRecords } as never,
        })
        const idempotencyKey = randomUUID()
        const rawBody = `{"idempotencyKey":"${idempotencyKey}","records":[{"provider":"health_connect","recordType":"DistanceRecord","externalId":"distance-1","externalVersion":1,"startTime":"2026-08-23T08:00:00.000Z","endTime":"2026-08-23T08:30:00.000Z","payload":{"meters":1E-7}}]}`
        const rawHash = createHash('sha256').update(rawBody).digest('hex')
        const reserializedHash = createHash('sha256')
            .update(JSON.stringify(JSON.parse(rawBody)))
            .digest('hex')

        expect(rawHash).not.toBe(reserializedHash)
        const response = await app.inject({
            method: 'POST',
            url: '/api/device/health-records',
            payload: rawBody,
            headers: { 'content-type': 'application/json' },
        })

        expect(response.statusCode).toBe(200)
        expect(authenticateDetailed).toHaveBeenCalledWith(
            expect.objectContaining({ bodyHash: rawHash }),
        )
        expect(uploadHealthRecords).toHaveBeenCalledOnce()
        await app.close()
    })

    it.each(['signature_mismatch', 'clock_skew', 'device_revoked', 'nonce_replay'] as const)(
        'keeps the %s diagnostic server-side and returns only unauthorized',
        async reason => {
            const authenticateDetailed = vi.fn().mockResolvedValue({
                error: reason,
                serverTime: '2026-08-23T12:00:00.000Z',
            })
            const app = await createApp(new MemoryJournalRepository(), {
                devices: { authenticateDetailed } as never,
            })

            const response = await app.inject({
                method: 'POST',
                url: '/api/device/health-records',
                payload: { idempotencyKey: randomUUID(), records: [] },
                headers: { 'x-device-id': 'diagnostic-device' },
            })

            expect(response.statusCode).toBe(401)
            expect(response.json()).toEqual({ error: 'unauthorized' })
            expect(response.body).not.toContain(reason)
            expect(authenticateDetailed).toHaveBeenCalledOnce()
            await app.close()
        },
    )
})

describe('journal API', () => {
    it('validates and forwards bounded journal ranges', async () => {
        const repository = new MemoryJournalRepository()
        const app = await createApp(repository)
        const response = await app.inject({
            method: 'GET',
            url: '/api/journal?from=2026-08-22T00%3A00%3A00.000Z&to=2026-08-23T00%3A00%3A00.000Z&limit=25',
        })

        expect(response.statusCode).toBe(200)
        expect(repository.lastListQuery).toEqual({
            from: '2026-08-22T00:00:00.000Z',
            to: '2026-08-23T00:00:00.000Z',
            limit: 25,
        })
        expect(
            (await app.inject({ method: 'GET', url: '/api/journal?limit=501' })).statusCode,
        ).toBe(400)
        await app.close()
    })

    it('keeps Journal read-only', async () => {
        const repository = new MemoryJournalRepository()
        const app = await createApp(repository)
        const id = randomUUID()
        const payload = {
            id,
            category: 'Meals',
            title: 'Lunch',
            detail: 'Lentil soup',
            source: 'You',
            observedAt: new Date().toISOString(),
        }

        expect((await app.inject({ method: 'POST', url: '/api/journal', payload })).statusCode).toBe(404)
        expect((await app.inject({ method: 'PATCH', url: `/api/journal/${id}`, payload })).statusCode).toBe(404)
        expect((await app.inject({ method: 'DELETE', url: `/api/journal/${id}` })).statusCode).toBe(404)
        expect((await app.inject({ method: 'GET', url: '/api/journal' })).statusCode).toBe(200)
        await app.close()
    })

    it('rejects invalid health records without echoing the payload', async () => {
        const app = await createApp(new MemoryJournalRepository())
        const response = await app.inject({
            method: 'POST',
            url: '/api/journal',
            payload: { title: '' },
        })
        expect(response.statusCode).toBe(404)
        expect(response.body).not.toContain('health payload')
        await app.close()
    })

    it('creates an observation-native meal without dual-writing a Journal entity', async () => {
        const repository = new MemoryJournalRepository()
        const mealId = randomUUID()
        const removedMeals: string[] = []
        const data = {
            createMeal: async () => ({ id: mealId }),
            removeMeal: async (id: string) => {
                removedMeals.push(id)
                return true
            },
            removeObservation: async () => false,
        }
        const app = await createApp(repository, { dataRepository: data as never })
        const created = await app.inject({
            method: 'POST',
            url: '/api/meals',
            payload: {
                id: mealId,
                name: 'Lentil bowl',
                mealType: 'Lunch',
                eatenAt: '2026-08-20T12:00:00.000Z',
                nutrients: { calories: 500 },
            },
        })
        expect(created.statusCode).toBe(201)
        expect(repository.entries).toEqual([])
        expect(removedMeals).toEqual([])
        await app.close()
    })

    it('fails closed without a session and applies security headers', async () => {
        const auth = {
            configured: async () => true,
            authenticate: async () => null,
        }
        const data = {
            createObservation: async (input: unknown) => ({ id: randomUUID(), ...(input as object) }),
        }
        const app = await createApp(new MemoryJournalRepository(), {
            auth: auth as never,
            dataRepository: data as never,
        })
        const protectedResponse = await app.inject({ method: 'GET', url: '/api/journal' })
        const healthResponse = await app.inject({ method: 'GET', url: '/api/health' })

        expect(protectedResponse.statusCode).toBe(401)
        expect(healthResponse.statusCode).toBe(200)
        expect(healthResponse.headers['x-content-type-options']).toBe('nosniff')
        expect(healthResponse.headers['x-frame-options']).toBe('SAMEORIGIN')
        expect(healthResponse.headers['referrer-policy']).toBe('no-referrer')
        await app.close()
    })

    it('requires the configured bootstrap secret for first-owner setup', async () => {
        const auth = {
            configured: async () => false,
            authenticate: async () => null,
            setup: vi.fn(async () => ({
                session: { token: 'token', expiresAt: new Date(Date.now() + 60_000) },
                recoveryCodes: [],
            })),
        }
        const app = await createApp(new MemoryJournalRepository(), {
            auth: auth as never,
            bootstrapSecret: 'a-secure-bootstrap-secret-with-32-characters',
        })
        const payload = { password: 'a-secure-owner-password' }
        expect(
            (await app.inject({ method: 'POST', url: '/api/auth/setup', payload })).statusCode,
        ).toBe(403)
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/auth/setup',
                    headers: {
                        'x-trackit-bootstrap-secret':
                            'a-secure-bootstrap-secret-with-32-characters',
                    },
                    payload,
                })
            ).statusCode,
        ).toBe(201)
        expect(auth.setup).toHaveBeenCalledTimes(1)
        await app.close()
    })

    it('requires a matching CSRF cookie and header for mutations', async () => {
        const auth = {
            configured: async () => true,
            authenticate: async () => ({ id: 'session' }),
        }
        const app = await createApp(new MemoryJournalRepository(), { auth: auth as never })
        const payload = {
            category: 'Check-ins',
            title: 'Energy',
            source: 'You',
            observedAt: new Date().toISOString(),
        }

        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/observations',
                    headers: { cookie: 'trackit_session=session' },
                    payload: { metric: 'check_in', valueType: 'event', observedAt: payload.observedAt },
                })
            ).statusCode,
        ).toBe(403)
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/observations',
                    headers: {
                        cookie: 'trackit_session=session; trackit_csrf=token',
                        'x-csrf-token': 'token',
                    },
                    payload: { metric: 'check_in', valueType: 'event', observedAt: payload.observedAt },
                })
            ).statusCode,
        ).toBe(201)
        await app.close()
    })

    it('throttles password and recovery-code guessing independently', async () => {
        const auth = {
            configured: async () => true,
            authenticate: async () => null,
            login: async () => null,
            recover: async () => null,
        }
        const app = await createApp(new MemoryJournalRepository(), { auth: auth as never })
        const attempts = async (url: string, payload: object) => {
            const responses = []
            for (let index = 0; index < 6; index += 1) {
                responses.push(await app.inject({ method: 'POST', url, payload }))
            }
            return responses
        }
        const login = await attempts('/api/auth/login', { password: 'incorrect-password' })
        const recovery = await attempts('/api/auth/recover', { code: 'invalid-code-0000' })
        expect(login.slice(0, 5).every(response => response.statusCode === 401)).toBe(true)
        expect(login[5].statusCode).toBe(429)
        expect(recovery.slice(0, 5).every(response => response.statusCode === 401)).toBe(true)
        expect(recovery[5].statusCode).toBe(429)
        await app.close()
    })
})
