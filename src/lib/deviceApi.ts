import type { paths } from './api.generated'
import { apiClient } from './apiClient'

export type DeviceRecord =
    paths['/api/devices']['get']['responses'][200]['content']['application/json']['data'][number]

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
    const { data, response } = await apiClient.POST('/api/devices/pair')
    if (!response.ok || !data) throw new Error('Could not create pairing code')
    return data
}

export async function listDevices(signal?: AbortSignal): Promise<DeviceRecord[]> {
    const { data, response } = await apiClient.GET('/api/devices', { signal })
    if (!response.ok || !data) throw new Error('Devices unavailable')
    return data.data
}

export async function confirmDevice(id: string) {
    const { response } = await apiClient.POST('/api/devices/{id}/confirm', {
        params: { path: { id } },
    })
    if (!response.ok) throw new Error('Could not confirm device')
}

export async function rejectDevice(id: string) {
    const { response } = await apiClient.POST('/api/devices/{id}/reject', {
        params: { path: { id } },
    })
    if (!response.ok) throw new Error('Could not reject device')
}

export async function revokeDevice(id: string) {
    const { response } = await apiClient.DELETE('/api/devices/{id}', {
        params: { path: { id } },
    })
    if (!response.ok) throw new Error('Could not revoke device')
}

export async function deleteDevice(id: string) {
    const { response } = await apiClient.DELETE('/api/devices/{id}/permanent', {
        params: { path: { id } },
    })
    if (!response.ok) throw new Error('Could not delete device')
}
