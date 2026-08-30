import { environment } from '../app/env'
import { authRequest } from './authApi'

export type FoodCategory = {
    id: string
    name: string
    foodIds: string[]
}

export async function listFoodCategories(signal?: AbortSignal) {
    const response = await fetch(`${environment.VITE_API_URL}/api/food-categories`, {
        credentials: 'same-origin',
        signal,
    })
    if (!response.ok) throw new Error('Food groups unavailable')
    return ((await response.json()) as { data: FoodCategory[] }).data
}

export async function setFoodCategories(foodId: string, categoryIds: string[]) {
    const response = await authRequest(`/api/foods/${foodId}/categories`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categoryIds }),
    })
    if (!response.ok) throw new Error('Could not update food groups.')
}
