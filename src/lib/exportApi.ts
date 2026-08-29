import { authRequest } from './authApi'

export async function downloadExport(format: 'json' | 'csv') {
    const response = await authRequest(`/api/export?format=${format}`)
    if (!response.ok) throw new Error('Export failed.')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `trackit-export-v2.${format}`
    link.click()
    URL.revokeObjectURL(url)
}
