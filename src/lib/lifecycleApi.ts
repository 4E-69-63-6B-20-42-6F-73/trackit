import { authRequest } from './authApi'

export type DataCategorySummary = {
    count: number
    oldest: string | null
    newest: string | null
}
export async function getDataCategorySummary(category: string): Promise<DataCategorySummary> {
    const response = await authRequest(`/api/data-summary?category=${encodeURIComponent(category)}`)
    if (!response.ok) throw new Error('Data summary unavailable')
    return ((await response.json()) as { data: DataCategorySummary }).data
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
