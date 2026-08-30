import {
    Alert,
    Button,
    Collapse,
    Group,
    Modal,
    NumberInput,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { useState } from 'react'
import type { Food, Nutrients } from '../domain/nutrition'
import { createFood } from '../lib/nutritionApi'

const labels: Record<keyof Nutrients, string> = {
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
const primary: (keyof Nutrients)[] = ['calories', 'protein', 'carbs', 'fat']
const optional: (keyof Nutrients)[] = ['fiber', 'sugar', 'saturatedFat', 'sodium', 'potassium']
const allNutrients: (keyof Nutrients)[] = [...primary, ...optional]

export function NewFoodModal({
    opened,
    onClose,
    onCreate,
}: {
    opened: boolean
    onClose: () => void
    onCreate: (food: Food) => void
}) {
    const [name, setName] = useState('')
    const [brand, setBrand] = useState('')
    const [barcode, setBarcode] = useState('')
    const [servingName, setServingName] = useState('serving')
    const [servingGrams, setServingGrams] = useState<number | string>(100)
    const [nutrients, setNutrients] = useState<Partial<Nutrients>>({})
    const [more, setMore] = useState(false)
    const [error, setError] = useState('')
    const field = (key: keyof Nutrients) => (
        <NumberInput
            key={key}
            label={`${labels[key]} per 100 g`}
            placeholder="Unknown"
            value={nutrients[key] ?? ''}
            onChange={value =>
                setNutrients(current => {
                    const next = { ...current }
                    if (value === '') delete next[key]
                    else next[key] = Number(value)
                    return next
                })
            }
            min={0}
        />
    )
    const save = async () => {
        try {
            const food = await createFood({
                name,
                brand: brand || undefined,
                barcode: barcode || undefined,
                per100g: nutrients,
                servingName,
                servingGrams: Number(servingGrams),
                favorite: false,
                nutritionQuality: allNutrients.every(key => nutrients[key] !== undefined)
                    ? 'complete'
                    : 'incomplete',
            })
            onCreate(food)
            setName('')
            setBrand('')
            setBarcode('')
            setNutrients({})
            onClose()
        } catch {
            setError('The food could not be saved to your server. No local copy was created.')
        }
    }
    return (
        <Modal opened={opened} onClose={onClose} title="Create food" centered size="md">
            <Stack>
                {error && <Alert color="orange">{error}</Alert>}
                <Text fw={650}>Basics</Text>
                <TextInput
                    label="Name"
                    required
                    value={name}
                    onChange={event => setName(event.currentTarget.value)}
                />
                <TextInput
                    label="Brand (optional)"
                    value={brand}
                    onChange={event => setBrand(event.currentTarget.value)}
                />
                <SimpleGrid cols={{ base: 1, xs: 2 }}>
                    <TextInput
                        label="Serving name"
                        value={servingName}
                        onChange={event => setServingName(event.currentTarget.value)}
                    />
                    <NumberInput
                        label="Serving weight"
                        suffix=" g"
                        min={0.1}
                        value={servingGrams}
                        onChange={setServingGrams}
                    />
                </SimpleGrid>
                <TextInput
                    label="Barcode (optional)"
                    value={barcode}
                    onChange={event => setBarcode(event.currentTarget.value)}
                />
                <Text size="sm" c="dimmed">
                    Leave nutrients blank when they are unknown. Unknown values are not counted as
                    zero.
                </Text>
                <SimpleGrid cols={{ base: 1, xs: 2 }}>{primary.map(field)}</SimpleGrid>
                <Button
                    variant="subtle"
                    color="gray"
                    rightSection={
                        more ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />
                    }
                    onClick={() => setMore(value => !value)}
                >
                    {more ? 'Hide more nutrients' : 'More nutrients'}
                </Button>
                <Collapse expanded={more}>
                    <Stack>{optional.map(field)}</Stack>
                </Collapse>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!name.trim() || !servingName.trim() || Number(servingGrams) <= 0}
                        onClick={() => void save()}
                    >
                        Save food
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
