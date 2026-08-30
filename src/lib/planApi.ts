import { environment } from '../app/env'
import type { MealPlanItem, MealType, PlanReferenceType } from '../domain/planning'
import { authRequest } from './authApi'
import { sharedJsonRequest } from './sharedRequest'

export type PlanReference = { type: PlanReferenceType; id: string }

export async function listPlanItems(
    range: { from?: string; to?: string } = {},
    signal?: AbortSignal,
) {
    const query = new URLSearchParams(
        Object.entries(range).filter((entry): entry is [string, string] => Boolean(entry[1])),
    )
    return (
        await sharedJsonRequest<{ data: MealPlanItem[] }>(
            `${environment.VITE_API_URL}/api/plan-items?${query}`,
            signal,
        )
    ).data
}

export async function createPlanMeal(input: {
    scheduledDate: string
    scheduledTime?: string | null
    mealType: MealType
    reference: PlanReference
    amount: number
    position?: number
}) {
    const response = await authRequest('/api/plan-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error('Could not add this meal to your plan.')
    return ((await response.json()) as { data: MealPlanItem }).data
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
    const response = await authRequest(`/api/plan-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: item.version, ...changes }),
    })
    if (response.status === 409)
        throw new Error('This plan changed elsewhere. Refresh and try again.')
    if (!response.ok) throw new Error('Could not update this planned meal.')
    return ((await response.json()) as { data: MealPlanItem }).data
}

export async function setPlanMealSkipped(item: MealPlanItem, skipped: boolean) {
    const response = await authRequest(`/api/plan-items/${item.id}/skip`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: item.version, skipped }),
    })
    if (response.status === 409)
        throw new Error('This plan changed elsewhere. Refresh and try again.')
    if (!response.ok) throw new Error('Could not update this planned meal.')
    return ((await response.json()) as { data: MealPlanItem }).data
}

export async function logPlannedMeal(
    item: MealPlanItem,
    input: { eatenAt: string; amount?: number; foodId?: string },
) {
    const response = await authRequest(`/api/plan-items/${item.id}/log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: item.version, ...input }),
    })
    if (response.status === 409) throw new Error('This planned meal was already changed or logged.')
    if (response.status === 400) throw new Error('Choose a food for this flexible target.')
    if (response.status === 404) throw new Error('That food does not belong to this food group.')
    if (!response.ok) throw new Error('Could not log this planned meal.')
    return ((await response.json()) as {
        data: { observationId: string; fulfilledAmount: number }
    }).data
}

export async function deletePlanMeal(item: MealPlanItem) {
    const response = await authRequest(`/api/plan-items/${item.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: item.version }),
    })
    if (response.status === 409)
        throw new Error('This plan changed elsewhere. Refresh and try again.')
    if (!response.ok && response.status !== 404)
        throw new Error('Could not remove this planned meal.')
}
