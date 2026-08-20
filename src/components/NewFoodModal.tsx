import { Button, Modal, NumberInput, Stack, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { Food } from '../domain/nutrition'
import { createFood } from '../lib/nutritionApi'

type NewFoodModalProps = {
    opened: boolean
    onClose: () => void
    onCreate: (food: Food) => void
}

export function NewFoodModal({ opened, onClose, onCreate }: NewFoodModalProps) {
    const [name, setName] = useState('')
    const [calories, setCalories] = useState<number | string>(0)

    const save = async () => {
        const input: Omit<Food, 'id'> = {
            name,
            per100g: {
                calories: Number(calories),
                protein: 0,
                carbs: 0,
                fat: 0,
                fiber: 0,
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
                <NumberInput
                    label="Calories per 100 g"
                    value={calories}
                    onChange={setCalories}
                    min={0}
                />
                <Button disabled={!name.trim()} onClick={() => void save()}>
                    Save food
                </Button>
            </Stack>
        </Modal>
    )
}
