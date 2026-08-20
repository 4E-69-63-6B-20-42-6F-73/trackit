import { environment } from '../app/env'

export const csrfToken = () =>
    document.cookie
        .split('; ')
        .find(value => value.startsWith('trackit_csrf='))
        ?.split('=')[1]

export const authRequest = (path: string, init?: RequestInit) =>
    fetch(`${environment.VITE_API_URL}${path}`, {
        credentials: 'same-origin',
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            ...(!['GET', 'HEAD'].includes(init?.method ?? 'GET')
                ? { 'x-csrf-token': csrfToken() ?? '' }
                : {}),
        },
    })
