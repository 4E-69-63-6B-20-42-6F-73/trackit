import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'
import { environment } from '../app/env'
import type { paths } from './api.generated'
import { csrfToken } from './authApi'
import { invalidateHealthQueries } from './healthQueries'

const affectsHealthQueries = (path: string, method: string) => {
    if (['GET', 'HEAD'].includes(method)) return false
    return (
        path === '/api/preferences' ||
        path.startsWith('/api/meals') ||
        path.startsWith('/api/goals') ||
        path === '/api/health-records/rebuild' ||
        path.startsWith('/api/data/') ||
        /^\/api\/plan-items\/[^/]+\/log$/.test(path)
    )
}

const authenticatedFetch: typeof fetch = async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
    )
    if (!['GET', 'HEAD'].includes(method)) {
        headers.set('x-csrf-token', csrfToken() ?? '')
    }
    const response = await fetch(input, {
        ...init,
        credentials: 'same-origin',
        headers,
    })
    if (response.ok) {
        const inputUrl = input instanceof Request ? input.url : String(input)
        const path = new URL(inputUrl, window.location.origin).pathname
        if (affectsHealthQueries(path, method)) await invalidateHealthQueries()
    }
    return response
}

export const apiClient = createFetchClient<paths>({
    baseUrl: environment.VITE_API_URL,
    fetch: authenticatedFetch,
})

export const $api = createClient(apiClient)
