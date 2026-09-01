import { environment } from '../app/env'
import { invalidateHealthQueries } from './healthQueries'

export const csrfToken = () =>
    document.cookie
        .split('; ')
        .find(value => value.startsWith('trackit_csrf='))
        ?.split('=')[1]

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

export const authRequest = async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const response = await fetch(`${environment.VITE_API_URL}${path}`, {
        credentials: 'same-origin',
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            ...(!['GET', 'HEAD'].includes(method) ? { 'x-csrf-token': csrfToken() ?? '' } : {}),
        },
    })
    if (response.ok && affectsHealthQueries(path, method)) await invalidateHealthQueries()
    return response
}
