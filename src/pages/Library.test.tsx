import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Food } from '../domain/nutrition'
import { listRecipes, searchFoods, type RecipeRecord } from '../lib/nutritionApi'
import { Library } from './Library'
import { LibraryFoods } from './LibraryFoods'
import { LibraryRecipes } from './LibraryRecipes'

vi.mock('../components/FoodCatalogLookup', () => ({ FoodCatalogLookup: () => null }))
vi.mock('../components/FoodCsvImport', () => ({ FoodCsvImport: () => null }))
vi.mock('../components/FoodEditModal', () => ({ FoodEditModal: () => null }))
vi.mock('../components/NewFoodModal', () => ({ NewFoodModal: () => null }))
vi.mock('../components/NewRecipeModal', () => ({ NewRecipeModal: () => null }))
vi.mock('../components/RecipeYieldModal', () => ({ RecipeYieldModal: () => null }))
vi.mock('../lib/nutritionApi', () => ({
    listRecipes: vi.fn(),
    searchFoods: vi.fn(),
    updateFood: vi.fn(),
    updateRecipeYield: vi.fn(),
}))

const food: Food = {
    id: 'oats',
    name: 'Oats',
    brand: 'TrackIt',
    per100g: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, fiber: 10.6 },
    servingName: '100 g',
    servingGrams: 100,
    favorite: false,
    nutritionQuality: 'complete',
    version: 1,
}

const recipe: RecipeRecord = {
    id: 'porridge',
    name: 'Porridge',
    servings: 2,
    favorite: false,
    version: 1,
    nutrientsPerServing: {
        calories: 320,
        protein: 14,
        carbs: 52,
        fat: 7,
        fiber: 8,
        sugar: 4,
        saturatedFat: 1,
        sodium: 120,
        potassium: 300,
    },
    nutritionQuality: 'complete',
    items: [],
}

const renderPage = (page: ReactNode) =>
    render(
        <MantineProvider>
            <MemoryRouter>{page}</MemoryRouter>
        </MantineProvider>,
    )

describe('Library', () => {
    beforeEach(() => {
        vi.mocked(searchFoods).mockResolvedValue([food])
        vi.mocked(listRecipes).mockResolvedValue([recipe])
    })

    it('uses dedicated subpage links for foods, recipes, and metrics', () => {
        renderPage(<Library />)

        expect(screen.getByRole('link', { name: 'Browse foods' })).toHaveAttribute(
            'href',
            '/library/foods',
        )
        expect(screen.getByRole('link', { name: 'Browse recipes' })).toHaveAttribute(
            'href',
            '/library/recipes',
        )
        expect(screen.getByRole('link', { name: 'Open Metric Center' })).toHaveAttribute(
            'href',
            '/library/metrics',
        )
        expect(screen.queryByText('Oats')).not.toBeInTheDocument()
        expect(screen.queryByText('Porridge')).not.toBeInTheDocument()
    })

    it('renders Foods as a standalone Library subpage', async () => {
        renderPage(<LibraryFoods />)

        expect(screen.getByRole('heading', { name: 'Foods', level: 1 })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Back to Library' })).toHaveAttribute(
            'href',
            '/library',
        )
        expect(await screen.findByText('Oats')).toBeInTheDocument()
        expect(screen.queryByText('Recipes')).not.toBeInTheDocument()
    })

    it('renders Recipes as a standalone Library subpage', async () => {
        renderPage(<LibraryRecipes />)

        expect(screen.getByRole('heading', { name: 'Recipes', level: 1 })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Back to Library' })).toHaveAttribute(
            'href',
            '/library',
        )
        expect(await screen.findByText('Porridge')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole('button', { name: 'New recipe' })).toBeEnabled())
    })
})
