import { Button, Modal, NumberInput, Stack, TextInput } from '@mantine/core'
import { useState } from 'react'
import { emptyNutrients, type Food, type Nutrients } from '../domain/nutrition'
import { createFood } from '../lib/nutritionApi'

type NewFoodModalProps = {
    opened: boolean
    onClose: () => void
    onCreate: (food: Food) => void
}

const nutrientLabels: Record<keyof Nutrients, string> = {
    calories: 'Calories',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    fiber: 'Fiber',
    sugar: 'Sugar',
    saturatedFat: 'Saturated fat',
    sodium: 'Sodium',
    potassium: 'Potassium',
}

export function NewFoodModal({ opened, onClose, onCreate }: NewFoodModalProps) {
    const [name, setName] = useState('')
    const [nutrients, setNutrients] = useState<Nutrients>(emptyNutrients())

    const save = async () => {
        const input: Omit<Food, 'id'> = {
            name,
            per100g: {
                ...nutrients,
            },
            servingName: 'serving',
            servingGrams: 100,
            favorite: false,
        }

        try {
            onCreate(await createFood(input))
        } catch {
            onCreate({ ...input, id: crypto.randomUUID() })
        }

        setName('')
        onClose()
    }

    return (
        <Modal opened={opened} onClose={onClose} title="Create food" centered>
            <Stack>
                <TextInput
                    label="Name"
                    value={name}
                    onChange={event => setName(event.currentTarget.value)}
                />
                {(Object.keys(nutrients) as (keyof Nutrients)[]).map(key => (
                    <NumberInput
                        key={key}
                        label={`${nutrientLabels[key]} per 100 g`}
                        value={nutrients[key]}
                        onChange={value =>
                            setNutrients(current => ({ ...current, [key]: Number(value) || 0 }))
                        }
                        min={0}
                    />
                ))}
                <Button disabled={!name.trim()} onClick={() => void save()}>
                    Save food
                </Button>
            </Stack>
        </Modal>
    )
}
