import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { registerMcpBrowserCors } from './browser-cors.js'

describe('MCP browser CORS', () => {
    it('adds CORS headers before a hijacked MCP response', async () => {
        const app = Fastify()
        app.post('/mcp', async (_request, reply) => {
            reply.hijack()
            reply.raw.statusCode = 200
            reply.raw.end('{}')
        })
        registerMcpBrowserCors(app, {
            allowedOrigins: vi.fn().mockResolvedValue(['https://inference.home.bos.blue']),
        } as never)

        const response = await app.inject({
            method: 'POST',
            url: '/mcp',
            headers: { origin: 'https://inference.home.bos.blue' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.headers['access-control-allow-origin']).toBe(
            'https://inference.home.bos.blue',
        )
        expect(response.headers['access-control-allow-methods']).toBe('POST, GET, OPTIONS')
        expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
        await app.close()
    })

    it('rejects disallowed origins before the MCP handler runs', async () => {
        const app = Fastify()
        const handler = vi.fn(async () => ({ ok: true }))
        app.post('/mcp', handler)
        registerMcpBrowserCors(app, {
            allowedOrigins: vi.fn().mockResolvedValue(['https://inference.home.bos.blue']),
        } as never)

        const response = await app.inject({
            method: 'POST',
            url: '/mcp',
            headers: { origin: 'https://untrusted.example' },
        })

        expect(response.statusCode).toBe(403)
        expect(handler).not.toHaveBeenCalled()
        expect(response.headers['access-control-allow-origin']).toBeUndefined()
        await app.close()
    })

    it('keeps GET in the final preflight methods', async () => {
        const app = Fastify()
        app.options('/mcp', async (_request, reply) => {
            reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            return reply.code(204).send()
        })
        registerMcpBrowserCors(app, {
            allowedOrigins: vi.fn().mockResolvedValue(['https://inference.home.bos.blue']),
        } as never)

        const response = await app.inject({
            method: 'OPTIONS',
            url: '/mcp',
            headers: {
                origin: 'https://inference.home.bos.blue',
                'access-control-request-method': 'GET',
                'access-control-request-headers': 'authorization,mcp-protocol-version',
            },
        })

        expect(response.statusCode).toBe(204)
        expect(response.headers['access-control-allow-methods']).toBe('POST, GET, OPTIONS')
        await app.close()
    })
})
