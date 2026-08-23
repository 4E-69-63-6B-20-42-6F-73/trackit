import { environment } from '../app/env'
import { sharedJsonRequest } from './sharedRequest'

export type DailyMetric = {
    date: string
    metric: string
    value: number
    unit: string
    derivationVersion: number
}

export async function listDailyMetrics(
    range: { from: string; to: string },
    signal?: AbortSignal,
): Promise<DailyMetric[]> {
    const query = new URLSearchParams(range)
    return (
        await sharedJsonRequest<{ data: DailyMetric[] }>(
            `${environment.VITE_API_URL}/api/daily-metrics?${query}`,
            signal,
        )
    ).data
}
