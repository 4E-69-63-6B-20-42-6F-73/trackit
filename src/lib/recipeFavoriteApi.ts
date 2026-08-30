import type { RecipeRecord } from './nutritionApi'
import { authRequest } from './authApi'

export async function setRecipeFavorite(recipe: RecipeRecord, favorite: boolean) {
    const response = await authRequest(`/api/recipes/${recipe.id}/favorite`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ favorite, version: recipe.version }),
    })
    if (response.status === 409) throw new Error('Recipe changed elsewhere. Reload and try again.')
    if (!response.ok) throw new Error('Could not update recipe favorite')
    const body = (await response.json()) as { data: { favorite: boolean; version: number } }
    return { ...recipe, favorite: body.data.favorite, version: body.data.version }
}
