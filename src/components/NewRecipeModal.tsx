import { Button, Modal, NumberInput, Select, Stack, Switch, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { Food } from '../domain/nutrition'
import { createRecipe } from '../lib/nutritionApi'

export function NewRecipeModal({
    opened,
    onClose,
    foods,
    onCreated,
}: {
    opened: boolean
    onClose: () => void
    foods: Food[]
    onCreated: () => void
}) {
    const [name, setName] = useState('')
    const [foodId, setFoodId] = useState<string | null>(null)
    const [grams, setGrams] = useState<number | string>(100)
    const [servings, setServings] = useState<number | string>(1)
    const [favorite, setFavorite] = useState(false)
    const [saving, setSaving] = useState(false)

    const save = async () => {
        if (!foodId) return
        setSaving(true)
        try {
            await createRecipe({
                name,
                servings: Number(servings),
                favorite,
                items: [{ foodId, grams: Number(grams) }],
            })
            onCreated()
            setName('')
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal opened={opened} onClose={onClose} title="Create recipe" centered>
            <Stack>
                <TextInput
                    label="Recipe name"
                    value={name}
                    onChange={event => setName(event.currentTarget.value)}
                />
                <Select
                    label="First ingredient"
                    value={foodId}
                    onChange={setFoodId}
                    data={foods.map(food => ({ value: food.id, label: food.name }))}
                    searchable
                />
                <NumberInput
                    label="Ingredient amount"
                    suffix=" g"
                    min={1}
                    value={grams}
                    onChange={setGrams}
                />
                <NumberInput
                    label="Recipe yield"
                    suffix=" servings"
                    min={0.1}
                    value={servings}
                    onChange={setServings}
                />
                <Switch
                    label="Favorite recipe"
                    checked={favorite}
                    onChange={event => setFavorite(event.currentTarget.checked)}
                />
                <Button
                    loading={saving}
                    disabled={!name.trim() || !foodId}
                    onClick={() => void save()}
                >
                    Save recipe
                </Button>
            </Stack>
        </Modal>
    )
}
