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

export type HealthConnectStatus =
    | 'Connected'
    | 'Syncing'
    | 'Up to date'
    | 'Delayed'
    | 'Permission required'
    | 'Device unreachable'
    | 'Authentication failed'
    | 'Not connected'

export function healthConnectStatus(
    devices: DeviceRecord[],
    now = Date.now(),
): HealthConnectStatus {
    const active = devices.filter(device => device.status === 'active')
    if (active.length) {
        const diagnostics = active.flatMap(device =>
            device.sync.map(cursor => cursor.diagnostic ?? ''),
        )
        if (diagnostics.some(value => /signature|nonce|revoked|auth/i.test(value))) {
            return 'Authentication failed'
        }
        if (active.some(device => device.sync.some(cursor => cursor.status === 'syncing'))) {
            return 'Syncing'
        }
        const latest = Math.max(
            ...active.map(device =>
                device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0,
            ),
        )
        if (latest === 0) return 'Connected'
        if (now - latest > 7 * 24 * 60 * 60 * 1000) return 'Device unreachable'
        return now - latest <= 24 * 60 * 60 * 1000 ? 'Up to date' : 'Delayed'
    }
    if (devices.some(device => device.status === 'pending' || device.status === 'confirmed')) {
        return 'Permission required'
    }
    return 'Not connected'
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

export async function deleteDevice(id: string) {
    const response = await authRequest(`/api/devices/${id}/permanent`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Could not delete device')
}
