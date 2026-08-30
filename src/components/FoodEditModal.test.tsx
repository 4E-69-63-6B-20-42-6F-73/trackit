import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Food } from '../domain/nutrition'
import { FoodEditModal } from './FoodEditModal'

const food: Food = {
    id: 'food-1',
    name: 'Plain Skyr',
    brand: 'Generic',
    servingName: 'serving',
    servingGrams: 100,
    favorite: false,
    nutritionQuality: 'estimated',
    version: 1,
    per100g: {
        calories: 63,
        protein: 11,
        carbs: 4,
        fat: 0.2,
        sugar: 4,
    },
}

const renderEditor = (onSave = vi.fn().mockResolvedValue(undefined), onDelete = vi.fn()) => {
    const onClose = vi.fn()
    render(
        <MantineProvider>
            <FoodEditModal food={food} onClose={onClose} onSave={onSave} onDelete={onDelete} />
        </MantineProvider>,
    )
    return { onClose, onSave, onDelete }
}

describe('FoodEditModal', () => {
    it('keeps a cleared nutrient unknown instead of changing it to zero', async () => {
        const user = userEvent.setup()
        const { onSave } = renderEditor()

        await user.clear(screen.getByLabelText('Sugar (g / 100 g)'))
        await user.click(screen.getByRole('button', { name: 'Save food' }))

        await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
        const saved = onSave.mock.calls[0][0]
        expect(saved.per100g).not.toHaveProperty('sugar')
        expect(saved.per100g.fat).toBe(0.2)
    })

    it('requires confirmation before permanently deleting a food', async () => {
        const user = userEvent.setup()
        const onDelete = vi.fn().mockResolvedValue(undefined)
        const { onClose } = renderEditor(vi.fn().mockResolvedValue(undefined), onDelete)

        await user.click(screen.getByRole('button', { name: 'Delete food' }))
        expect(
            screen.getByText('Logged meals keep their saved nutrition.', { exact: false }),
        ).toBeVisible()
        expect(onDelete).not.toHaveBeenCalled()

        await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
        await waitFor(() => expect(onDelete).toHaveBeenCalledOnce())
        expect(onClose).toHaveBeenCalledOnce()
    })
})
