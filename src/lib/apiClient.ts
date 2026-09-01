import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'
import { environment } from '../app/env'
import type { paths } from './api.generated'
import { csrfToken } from './authApi'

const authenticatedFetch: typeof fetch = (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
    )
    if (!['GET', 'HEAD'].includes(method)) {
        headers.set('x-csrf-token', csrfToken() ?? '')
    }
    return fetch(input, {
        ...init,
        credentials: 'same-origin',
        headers,
    })
}

export const apiClient = createFetchClient<paths>({
    baseUrl: environment.VITE_API_URL,
    fetch: authenticatedFetch,
})

export const $api = createClient(apiClient)
