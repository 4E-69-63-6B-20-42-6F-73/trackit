import { queryClient } from './queryClient'

export const healthQueryKeys = {
    observations: ['get', '/api/observations'] as const,
    dailyMetrics: ['get', '/api/daily-metrics'] as const,
    metricSources: ['get', '/api/metric-sources'] as const,
    goalEvaluations: ['health', 'goal-evaluations'] as const,
}

export async function invalidateHealthQueries() {
    await Promise.all(
        Object.values(healthQueryKeys).map(queryKey =>
            queryClient.invalidateQueries({ queryKey }),
        ),
    )
}
