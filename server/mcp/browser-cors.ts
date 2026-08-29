import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { McpAccessService } from './service.js'

const isMcpRequest = (request: FastifyRequest) => request.url.split('?')[0] === '/mcp'

const setMcpCorsHeaders = (reply: FastifyReply, origin: string) => {
    reply.raw.setHeader('Access-Control-Allow-Origin', origin)
    reply.raw.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    reply.raw.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id',
    )
    reply.raw.setHeader('Access-Control-Expose-Headers', 'MCP-Session-Id')
    reply.raw.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.raw.setHeader('Vary', 'Origin')
}

export function registerMcpBrowserCors(app: FastifyInstance, mcp: McpAccessService) {
    app.addHook('onRequest', async (request, reply) => {
        if (!isMcpRequest(request)) return
        const origin = request.headers.origin
        if (typeof origin !== 'string') return
        if (!(await mcp.allowedOrigins()).includes(origin))
            return reply.code(403).send({ error: 'mcp_origin_not_allowed' })
        setMcpCorsHeaders(reply, origin)
    })

    app.addHook('onSend', async (request, reply, payload) => {
        if (
            isMcpRequest(request) &&
            reply.raw.getHeader('Access-Control-Allow-Origin') !== undefined
        )
            reply.raw.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        return payload
    })
}
