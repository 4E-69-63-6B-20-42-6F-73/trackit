import type { Goal, GoalEvaluation } from '@trackit/domain/goals'
import type { paths } from './api.generated'
import { apiClient } from './apiClient'

export type GoalRecord = Goal

export type GoalInput = paths['/api/goals']['post']['requestBody']['content']['application/json']
type GoalApiRecord =
    paths['/api/goals']['get']['responses'][200]['content']['application/json']['data'][number]

const toGoal = (record: GoalApiRecord): GoalRecord => record

export async function listGoals(signal?: AbortSignal): Promise<GoalRecord[]> {
    const { data, response } = await apiClient.GET('/api/goals', { signal })
    if (!response.ok || !data) throw new Error('Goals unavailable')
    return data.data.map(toGoal)
}

export async function listGoalEvaluations(
    signal?: AbortSignal,
    at?: string,
): Promise<Record<string, GoalEvaluation>> {
    const { data, response } = await apiClient.GET('/api/goals/evaluations', {
        params: { query: { at } },
        signal,
    })
    if (!response.ok || !data) throw new Error('Goal evaluations unavailable')
    return data.data
}

export async function createGoal(input: GoalInput) {
    const { data, response } = await apiClient.POST('/api/goals', { body: input })
    if (!response.ok || !data) throw new Error('Could not create goal')
    const saved = toGoal(data.data)
    window.dispatchEvent(new CustomEvent('trackit:goal-saved', { detail: saved }))
    return saved
}

export async function retireGoal(goal: GoalRecord) {
    const { data, response } = await apiClient.PATCH('/api/goals/{id}', {
        params: { path: { id: goal.id } },
        body: { effectiveTo: new Date().toISOString() },
    })
    if (!response.ok || !data) throw new Error('Could not retire goal')
    const saved = toGoal(data.data)
    window.dispatchEvent(new CustomEvent('trackit:goal-saved', { detail: saved }))
    return saved
}

export async function updateGoal(id: string, input: GoalInput) {
    const { data, response } = await apiClient.PATCH('/api/goals/{id}', {
        params: { path: { id } },
        body: input,
    })
    if (!response.ok || !data) throw new Error('Could not update goal')
    const saved = toGoal(data.data)
    window.dispatchEvent(new CustomEvent('trackit:goal-saved', { detail: saved }))
    return saved
}

export async function deleteGoal(goal: GoalRecord) {
    const { response } = await apiClient.DELETE('/api/goals/{id}', {
        params: { path: { id: goal.id } },
    })
    if (!response.ok) throw new Error('Only retired goals can be deleted')
    window.dispatchEvent(new CustomEvent('trackit:goal-deleted', { detail: goal.id }))
}
