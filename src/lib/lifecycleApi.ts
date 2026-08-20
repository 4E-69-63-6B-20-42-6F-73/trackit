import { authRequest } from './authApi'

export type BackupRecord = {
    id: string
    filename: string
    status: string
    sizeBytes: number | null
    diagnostic: string | null
    createdAt: string
    verifiedAt: string | null
}

export async function listBackups() {
    const response = await authRequest('/api/backups')
    if (!response.ok) throw new Error('Backups unavailable')
    return (await response.json()) as { configured: boolean; data: BackupRecord[] }
}

export async function createBackup() {
    const response = await authRequest('/api/backups', { method: 'POST' })
    if (!response.ok) throw new Error('Configure an external backup encryption key first.')
    return ((await response.json()) as { data: BackupRecord }).data
}

export async function verifyBackup(filename: string) {
    const response = await authRequest(`/api/backups/${encodeURIComponent(filename)}/verify`, {
        method: 'POST',
    })
    if (!response.ok) throw new Error('Backup verification failed.')
}

export async function setRetention(category: string, days: number, enabled: boolean) {
    const response = await authRequest(`/api/retention/${category}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days, enabled }),
    })
    if (!response.ok) throw new Error('Retention rule could not be saved.')
}

export async function deleteCategory(category: string) {
    const response = await authRequest(`/api/data/${category}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Category deletion failed.')
}

export async function deleteOwnerData(confirmation: string) {
    const response = await authRequest('/api/data/delete-owner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation }),
    })
    if (!response.ok) throw new Error('Enter the confirmation phrase exactly.')
}

export async function downloadExport(format: 'json' | 'csv') {
    const response = await authRequest(`/api/export?format=${format}`)
    if (!response.ok) throw new Error('Export failed.')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `trackit-export-v1.${format}`
    link.click()
    URL.revokeObjectURL(url)
}
