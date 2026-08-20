import { authRequest } from './authApi'

export type TrendViewRecord = {
    id: string
    name: string
    metric: string
    comparisonMetric: string | null
    rangeDays: number
    granularity: 'daily' | 'weekly'
}

export async function listTrendViews(): Promise<TrendViewRecord[]> {
    const response = await authRequest('/api/trend-views')
    if (!response.ok) throw new Error('Saved trend views unavailable')
    return ((await response.json()) as { data: TrendViewRecord[] }).data
}

export async function saveTrendView(input: {
    name: string
    metric: string
    comparisonMetric?: string
    rangeDays: number
    granularity: 'daily' | 'weekly'
}) {
    const response = await authRequest('/api/trend-views', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error('Could not save trend view')
    return ((await response.json()) as { data: TrendViewRecord }).data
}
