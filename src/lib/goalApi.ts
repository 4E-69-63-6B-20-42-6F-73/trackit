import { authRequest } from './authApi'

export type GoalRecord = {
    id: string
    metric: string
    targetValue: number
    canonicalUnit: string
    effectiveFrom: string
    effectiveTo: string | null
    schedule: { weekdays?: number[] }
}

export async function listGoals(): Promise<GoalRecord[]> {
    const response = await authRequest('/api/goals')
    if (!response.ok) throw new Error('Goals unavailable')
    return ((await response.json()) as { data: GoalRecord[] }).data
}

export async function createGoal(input: Omit<GoalRecord, 'id'>) {
    const { effectiveTo, ...required } = input
    const response = await authRequest('/api/goals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...required, ...(effectiveTo ? { effectiveTo } : {}) }),
    })
    if (!response.ok) throw new Error('Could not create goal')
    return ((await response.json()) as { data: GoalRecord }).data
}
