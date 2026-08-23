import { authRequest } from './authApi'

export type DeviceRecord = {
    id: string
    name: string
    keyFingerprint: string
    status: string
    confirmedAt: string | null
    configuredAt: string | null
    revokedAt: string | null
    lastSeenAt: string | null
    createdAt: string
    sync: {
        recordType: string
        status: string
        lastSyncedAt: string | null
        diagnostic: string | null
    }[]
}

export async function createPairingCode() {
    const response = await authRequest('/api/devices/pair', { method: 'POST' })
    if (!response.ok) throw new Error('Could not create pairing code')
    return (await response.json()) as { code: string; expiresAt: string; serverIdentity: string }
}

export async function listDevices(): Promise<DeviceRecord[]> {
    const response = await authRequest('/api/devices')
    if (!response.ok) throw new Error('Devices unavailable')
    return ((await response.json()) as { data: DeviceRecord[] }).data
}

export async function confirmDevice(id: string) {
    const response = await authRequest(`/api/devices/${id}/confirm`, { method: 'POST' })
    if (!response.ok) throw new Error('Could not confirm device')
}

export async function rejectDevice(id: string) {
    const response = await authRequest(`/api/devices/${id}/reject`, { method: 'POST' })
    if (!response.ok) throw new Error('Could not reject device')
}

export async function revokeDevice(id: string) {
    const response = await authRequest(`/api/devices/${id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Could not revoke device')
}
