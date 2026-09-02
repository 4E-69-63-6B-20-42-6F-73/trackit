import type { paths } from './api.generated'
import { apiClient } from './apiClient'

export { csrfToken } from './csrf'

export type AuthStatus =
    paths['/api/auth/status']['get']['responses'][200]['content']['application/json']
export type AuthSession =
    paths['/api/auth/sessions']['get']['responses'][200]['content']['application/json']['data'][number]
export type AuthAuditEvent =
    paths['/api/auth/audit']['get']['responses'][200]['content']['application/json']['data'][number]

export async function loadAuthStatus(signal?: AbortSignal): Promise<AuthStatus> {
    const { data, response } = await apiClient.GET('/api/auth/status', { signal })
    if (!response.ok || !data) throw new Error('unavailable')
    return data
}

export async function setupOwner(password: string, bootstrapSecret: string) {
    const { data, response } = await apiClient.POST('/api/auth/setup', {
        params: { header: { 'x-trackit-bootstrap-secret': bootstrapSecret } },
        body: { password },
    })
    if (!response.ok || !data)
        throw new Error('Check the setup secret and use a password of at least 12 characters.')
    return data
}

export async function loginOwner(password: string) {
    const { response } = await apiClient.POST('/api/auth/login', { body: { password } })
    if (!response.ok) throw new Error('That password is incorrect.')
}

export async function recoverOwner(code: string) {
    const { response } = await apiClient.POST('/api/auth/recover', { body: { code } })
    if (!response.ok) throw new Error('That recovery code is invalid or has already been used.')
}

export async function registrationOptions() {
    const { data, response } = await apiClient.POST('/api/auth/passkey/register/options')
    if (!response.ok || !data) throw new Error('options_failed')
    return data
}

export async function verifyRegistration(attemptId: string, responseJSON: unknown) {
    const { response } = await apiClient.POST('/api/auth/passkey/register/verify', {
        body: { attemptId, response: responseJSON },
    })
    if (!response.ok) throw new Error('verification_failed')
}

export async function authenticationOptions() {
    const { data, response } = await apiClient.POST('/api/auth/passkey/authenticate/options')
    if (!response.ok || !data) throw new Error('options_failed')
    return data
}

export async function verifyAuthentication(attemptId: string, responseJSON: unknown) {
    const { response } = await apiClient.POST('/api/auth/passkey/authenticate/verify', {
        body: { attemptId, response: responseJSON },
    })
    if (!response.ok) throw new Error('verification_failed')
}

export async function logout() {
    const { response } = await apiClient.POST('/api/auth/logout')
    if (!response.ok) throw new Error('Could not sign out')
}

export async function logoutAll() {
    const { response } = await apiClient.POST('/api/auth/logout-all')
    if (!response.ok) throw new Error('Could not revoke sessions')
}

export async function listAuthSessions(signal?: AbortSignal): Promise<AuthSession[]> {
    const { data, response } = await apiClient.GET('/api/auth/sessions', { signal })
    if (!response.ok || !data) throw new Error('Sessions unavailable')
    return data.data
}

export async function revokeAuthSession(id: string) {
    const { response } = await apiClient.DELETE('/api/auth/sessions/{id}', {
        params: { path: { id } },
    })
    if (!response.ok) throw new Error('Could not revoke session')
}

export async function listAuthAudit(signal?: AbortSignal): Promise<AuthAuditEvent[]> {
    const { data, response } = await apiClient.GET('/api/auth/audit', { signal })
    if (!response.ok || !data) throw new Error('Audit log unavailable')
    return data.data
}
