import type { MealPlanItem, MealType, PlanReferenceType } from '@trackit/domain/planning'
import type { paths } from './api.generated'
import { apiClient } from './apiClient'

export type PlanReference = { type: PlanReferenceType; id: string }
export type PlanSchedule =
    paths['/api/plan-schedules']['get']['responses'][200]['content']['application/json']['data'][number]
type ApiPlanItem =
    paths['/api/plan-items']['get']['responses'][200]['content']['application/json']['data'][number]

const toPlanItem = (item: ApiPlanItem): MealPlanItem => item

export async function listPlanItems(
    range: { from?: string; to?: string } = {},
    signal?: AbortSignal,
) {
    const { data, response } = await apiClient.GET('/api/plan-items', {
        params: { query: range },
        signal,
    })
    if (!response.ok || !data) throw new Error('Plan unavailable')
    return data.data.map(toPlanItem)
}

export async function listPlanSchedules(signal?: AbortSignal) {
    const { data, response } = await apiClient.GET('/api/plan-schedules', { signal })
    if (!response.ok || !data) throw new Error('Recurring meal schedules unavailable')
    return data.data
}

export async function createPlanMeal(input: {
    scheduledDate: string
    scheduledTime?: string | null
    mealType: MealType
    reference: PlanReference
    amount: number
    position?: number
}) {
    const { data, response } = await apiClient.POST('/api/plan-items', { body: input })
    if (!response.ok || !data) throw new Error('Could not add this meal to your plan.')
    return toPlanItem(data.data)
}

export async function createPlanSchedule(input: {
    startDate: string
    scheduledTime?: string | null
    mealType: MealType
    reference: PlanReference
    amount: number
    weekdays: number[]
}) {
    const { data, response } = await apiClient.POST('/api/plan-schedules', { body: input })
    if (!response.ok || !data) throw new Error('Could not create this recurring meal schedule.')
    return data.data
}

export async function stopPlanSchedule(schedule: PlanSchedule, fromDate: string) {
    const { response } = await apiClient.DELETE('/api/plan-schedules/{id}', {
        params: { path: { id: schedule.id } },
        body: { version: schedule.version, fromDate },
    })
    if (response.status === 409)
        throw new Error('This schedule changed elsewhere. Refresh and try again.')
    if (!response.ok && response.status !== 404)
        throw new Error('Could not stop this recurring meal schedule.')
}

export async function updatePlanMeal(
    item: MealPlanItem,
    changes: Partial<{
        scheduledDate: string
        scheduledTime: string | null
        mealType: MealType
        reference: PlanReference
        amount: number
        position: number
    }>,
) {
    const { data, response } = await apiClient.PATCH('/api/plan-items/{id}', {
        params: { path: { id: item.id } },
        body: { version: item.version, ...changes },
    })
    if (response.status === 409)
        throw new Error('This plan changed elsewhere. Refresh and try again.')
    if (!response.ok || !data) throw new Error('Could not update this planned meal.')
    return toPlanItem(data.data)
}

export async function setPlanMealSkipped(item: MealPlanItem, skipped: boolean) {
    const { data, response } = await apiClient.POST('/api/plan-items/{id}/skip', {
        params: { path: { id: item.id } },
        body: { version: item.version, skipped },
    })
    if (response.status === 409)
        throw new Error('This plan changed elsewhere. Refresh and try again.')
    if (!response.ok || !data) throw new Error('Could not update this planned meal.')
    return toPlanItem(data.data)
}

export async function logPlannedMeal(
    item: MealPlanItem,
    input: { eatenAt: string; amount?: number; foodId?: string },
) {
    const { data, response } = await apiClient.POST('/api/plan-items/{id}/log', {
        params: { path: { id: item.id } },
        body: { version: item.version, ...input },
    })
    if (response.status === 409) throw new Error('This planned meal was already changed or logged.')
    if (response.status === 400) throw new Error('Choose a food for this flexible target.')
    if (response.status === 404) throw new Error('That food does not belong to this food group.')
    if (!response.ok || !data) throw new Error('Could not log this planned meal.')
    return data.data
}

export async function deletePlanMeal(item: MealPlanItem) {
    const { response } = await apiClient.DELETE('/api/plan-items/{id}', {
        params: { path: { id: item.id } },
        body: { version: item.version },
    })
    if (response.status === 409)
        throw new Error('This plan changed elsewhere. Refresh and try again.')
    if (!response.ok && response.status !== 404)
        throw new Error('Could not remove this planned meal.')
}
