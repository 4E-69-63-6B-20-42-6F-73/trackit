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
    return ((await response.json()) as { data: RecipeRecord }).data
}
