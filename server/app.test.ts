import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import type {
    CreateJournalEntry,
    JournalEntry,
    JournalRepository,
    UpdateJournalEntry,
} from './journal/types.js'

class MemoryJournalRepository implements JournalRepository {
    entries: JournalEntry[] = []

    async list() {
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

describe('journal API', () => {
    it('creates, lists, idempotently updates, and deletes a record', async () => {
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

        expect(
            (await app.inject({ method: 'POST', url: '/api/journal', payload })).statusCode,
        ).toBe(201)
        expect(
            (await app.inject({ method: 'POST', url: '/api/journal', payload })).statusCode,
        ).toBe(201)

        const listed = await app.inject({ method: 'GET', url: '/api/journal' })
        expect(listed.json().data).toHaveLength(1)

        const updated = await app.inject({
            method: 'PATCH',
            url: `/api/journal/${id}`,
            payload: { detail: 'Tomato soup', version: 1 },
        })
        expect(updated.statusCode).toBe(200)
        expect(updated.json().data).toMatchObject({ detail: 'Tomato soup', version: 2 })
        expect(
            (
                await app.inject({
                    method: 'PATCH',
                    url: `/api/journal/${id}`,
                    payload: { detail: 'Stale update', version: 1 },
                })
            ).statusCode,
        ).toBe(409)

        expect((await app.inject({ method: 'DELETE', url: `/api/journal/${id}` })).statusCode).toBe(
            204,
        )
        expect((await app.inject({ method: 'DELETE', url: `/api/journal/${id}` })).statusCode).toBe(
            404,
        )
        await app.close()
    })

    it('rejects invalid health records without echoing the payload', async () => {
        const app = await createApp(new MemoryJournalRepository())
        const response = await app.inject({
            method: 'POST',
            url: '/api/journal',
            payload: { title: '' },
        })
        expect(response.statusCode).toBe(400)
        expect(response.body).not.toContain('health payload')
        await app.close()
    })

    it('links API meals to the journal and removes paired data with the journal entry', async () => {
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
        expect(repository.entries).toContainEqual(
            expect.objectContaining({
                entityId: mealId,
                entityType: 'meal',
                title: 'Lentil bowl',
                source: 'You',
            }),
        )
        const linkedJournalId = repository.entries.find(entry => entry.entityId === mealId)!.id
        await app.inject({ method: 'DELETE', url: `/api/journal/${linkedJournalId}` })
        expect(removedMeals).toEqual([mealId])
        await app.close()
    })

    it('fails closed without a session and applies security headers', async () => {
        const auth = {
            configured: async () => true,
            authenticate: async () => null,
        }
        const app = await createApp(new MemoryJournalRepository(), { auth: auth as never })
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
                    url: '/api/journal',
                    headers: { cookie: 'trackit_session=session' },
                    payload,
                })
            ).statusCode,
        ).toBe(403)
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/api/journal',
                    headers: {
                        cookie: 'trackit_session=session; trackit_csrf=token',
                        'x-csrf-token': 'token',
                    },
                    payload,
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
