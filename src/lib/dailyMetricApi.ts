import { $api, apiClient } from './apiClient'
import type { paths } from './api.generated'
import { queryClient } from './queryClient'

export type DailyMetric =
    paths['/api/daily-metrics']['get']['responses'][200]['content']['application/json']['data'][number]

export const dailyMetricQueryOptions = (range: { from: string; to: string }) =>
    $api.queryOptions('get', '/api/daily-metrics', { params: { query: range } })

export async function listDailyMetrics(
    range: { from: string; to: string },
    signal?: AbortSignal,
): Promise<DailyMetric[]> {
    if (signal) {
        const { data, response } = await apiClient.GET('/api/daily-metrics', {
            params: { query: range },
            signal,
        })
        if (!response.ok || !data) throw new Error('Daily metrics could not be loaded')
        return data.data
    }
    const result = await queryClient.fetchQuery(dailyMetricQueryOptions(range))
    return result.data
}
