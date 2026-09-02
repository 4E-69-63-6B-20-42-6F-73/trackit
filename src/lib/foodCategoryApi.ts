import type { paths } from './api.generated'
import { apiClient } from './apiClient'

export type FoodCategory =
    paths['/api/food-categories']['get']['responses'][200]['content']['application/json']['data'][number]

export async function listFoodCategories(signal?: AbortSignal) {
    const { data, response } = await apiClient.GET('/api/food-categories', { signal })
    if (!response.ok || !data) throw new Error('Food groups unavailable')
    return data.data
}

export async function setFoodCategories(foodId: string, categoryIds: string[]) {
    const { response } = await apiClient.PUT('/api/foods/{id}/categories', {
        params: { path: { id: foodId } },
        body: { categoryIds },
    })
    if (!response.ok) throw new Error('Could not update food groups.')
}
