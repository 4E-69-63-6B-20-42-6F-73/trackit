import type { paths } from './api.generated'
import { apiClient } from './apiClient'

type TrendViewApiRecord =
    paths['/api/trend-views']['get']['responses'][200]['content']['application/json']['data'][number]
export type TrendViewRecord = Omit<TrendViewApiRecord, 'createdAt'>
export type SaveTrendViewInput =
    paths['/api/trend-views']['post']['requestBody']['content']['application/json']

const toTrendView = ({ createdAt: _createdAt, ...record }: TrendViewApiRecord): TrendViewRecord =>
    record

export async function listTrendViews(): Promise<TrendViewRecord[]> {
    const { data, response } = await apiClient.GET('/api/trend-views')
    if (!response.ok || !data) throw new Error('Saved trend views unavailable')
    return data.data.map(toTrendView)
}

export async function saveTrendView(input: SaveTrendViewInput) {
    const { data, response } = await apiClient.POST('/api/trend-views', { body: input })
    if (!response.ok || !data) throw new Error('Could not save trend view')
    return toTrendView(data.data)
}
