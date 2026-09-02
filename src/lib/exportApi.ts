import { apiClient } from './apiClient'

export async function downloadExport(format: 'json' | 'csv') {
    const { data, response } = await apiClient.GET('/api/export', {
        params: { query: { format } },
        parseAs: 'blob',
    })
    if (!response.ok || !data) throw new Error('Export failed.')
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = `trackit-export-v2.${format}`
    link.click()
    URL.revokeObjectURL(url)
}
