import type { Goal } from '../domain/goals'
import { authRequest } from './authApi'

export type GoalRecord = Goal
export async function listGoals(signal?: AbortSignal): Promise<GoalRecord[]> {
    const response = await authRequest('/api/goals', { signal })
    if (!response.ok) throw new Error('Goals unavailable')
    return ((await response.json()) as { data: GoalRecord[] }).data
}
export async function createGoal(input: Omit<GoalRecord, 'id'>) {
    const response = await authRequest('/api/goals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
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
export async function updateGoal(id: string, input: Omit<GoalRecord, 'id'>) {
    const response = await authRequest(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error('Could not update goal')
    const saved = ((await response.json()) as { data: GoalRecord }).data
    window.dispatchEvent(new CustomEvent('trackit:goal-saved', { detail: saved }))
    return saved
}

export async function deleteGoal(goal: GoalRecord) {
    const response = await authRequest(`/api/goals/${goal.id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Only retired goals can be deleted')
    window.dispatchEvent(new CustomEvent('trackit:goal-deleted', { detail: goal.id }))
}
