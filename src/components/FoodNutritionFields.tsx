import { Button, Collapse, Group, NumberInput, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { useId, useState, type ReactNode } from 'react'
import type { Nutrients } from '../domain/nutrition'

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

const units: Record<keyof Nutrients, string> = {
    calories: 'kcal',
    protein: 'g',
    carbs: 'g',
    fat: 'g',
    fiber: 'g',
    sugar: 'g',
    saturatedFat: 'g',
    sodium: 'mg',
    potassium: 'mg',
}

const primary: (keyof Nutrients)[] = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar']
const moreNutrients: (keyof Nutrients)[] = ['saturatedFat', 'sodium', 'potassium']

export function FoodNutritionFields({
    nutrients,
    onChange,
    status,
}: {
    nutrients: Partial<Nutrients>
    onChange: (key: keyof Nutrients, value: number | string) => void
    status?: ReactNode
}) {
    const [more, setMore] = useState(false)
    const moreId = useId()
    const field = (key: keyof Nutrients) => (
        <NumberInput
            key={key}
            label={labels[key]}
            suffix={` ${units[key]}`}
            placeholder="Unknown"
            hideControls
            min={0}
            value={nutrients[key] ?? ''}
            onChange={value => onChange(key, value)}
        />
    )

    return (
        <Stack gap="sm">
            <Group justify="space-between" align="center">
                <Text fw={650}>Nutrition per 100 g</Text>
                {status}
            </Group>
            <Text size="sm" c="dimmed">
                Leave a value blank when it is unknown. Unknown values are not counted as zero.
            </Text>
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                {primary.map(field)}
            </SimpleGrid>
            <Button
                type="button"
                variant="subtle"
                color="gray"
                justify="space-between"
                rightSection={more ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                aria-expanded={more}
                aria-controls={moreId}
                onClick={() => setMore(value => !value)}
            >
                {more ? 'Hide more nutrients' : 'More nutrients'}
            </Button>
            <Collapse expanded={more}>
                <SimpleGrid id={moreId} cols={{ base: 1, xs: 2 }} spacing="sm">
                    {moreNutrients.map(field)}
                </SimpleGrid>
            </Collapse>
        </Stack>
    )
}
