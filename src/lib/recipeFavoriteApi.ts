import { apiClient } from './apiClient'
import type { RecipeRecord } from './nutritionApi'

export async function setRecipeFavorite(recipe: RecipeRecord, favorite: boolean) {
    const { data, response } = await apiClient.PATCH('/api/recipes/{id}/favorite', {
        params: { path: { id: recipe.id } },
        body: { favorite, version: recipe.version },
    })
    if (response.status === 409) throw new Error('Recipe changed elsewhere. Reload and try again.')
    if (!response.ok || !data) throw new Error('Could not update recipe favorite')
    return { ...recipe, favorite: data.data.favorite, version: data.data.version }
}
