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

export async function listGoals(signal?: AbortSignal): Promise<GoalRecord[]> {
    const response = await authRequest('/api/goals', { signal })
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
    const saved = ((await response.json()) as { data: GoalRecord }).data
    window.dispatchEvent(new CustomEvent('trackit:goal-saved', { detail: saved }))
    return saved
}

export async function retireGoal(goal: GoalRecord) {
    const response = await authRequest(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ effectiveTo: new Date().toISOString() }),
    })
    if (!response.ok) throw new Error('Could not retire goal')
    const saved = ((await response.json()) as { data: GoalRecord }).data
    window.dispatchEvent(new CustomEvent('trackit:goal-saved', { detail: saved }))
    return saved
}

export async function updateGoal(id: string, input: Partial<Omit<GoalRecord, 'id'>>) {
    const response = await authRequest(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error('Could not update goal')
    return ((await response.json()) as { data: GoalRecord }).data
}
