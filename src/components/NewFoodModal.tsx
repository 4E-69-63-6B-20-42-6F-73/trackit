import {
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { foodNutrientKeys, type Food, type Nutrients } from '../domain/nutrition'
import { createFood } from '../lib/nutritionApi'
import { FoodNutritionFields } from './FoodNutritionFields'

export function NewFoodModal({
    opened,
    onClose,
    onCreate,
}: {
    opened: boolean
    onClose: () => void
    onCreate: (food: Food) => void
}) {
    const compact = useMediaQuery('(max-width: 36em)')
    const [name, setName] = useState('')
    const [brand, setBrand] = useState('')
    const [barcode, setBarcode] = useState('')
    const [servingName, setServingName] = useState('serving')
    const [servingGrams, setServingGrams] = useState<number | string>(100)
    const [nutrients, setNutrients] = useState<Partial<Nutrients>>({})

    const createMutation = useMutation({
        mutationFn: () =>
            createFood({
                name: name.trim(),
                brand: brand.trim() || undefined,
                barcode: barcode.trim() || undefined,
                per100g: nutrients,
                servingName: servingName.trim(),
                servingGrams: Number(servingGrams),
                favorite: false,
                nutritionQuality: foodNutrientKeys.every(key => nutrients[key] !== undefined)
                    ? 'complete'
                    : 'incomplete',
            }),
        onSuccess: food => {
            onCreate(food)
            setName('')
            setBrand('')
            setBarcode('')
            setServingName('serving')
            setServingGrams(100)
            setNutrients({})
            onClose()
        },
    })

    const setNutrient = (key: keyof Nutrients, value: number | string) => {
        setNutrients(current => {
            const next = { ...current }
            if (value === '') delete next[key]
            else next[key] = Number(value)
            return next
        })
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Create food"
            centered={!compact}
            fullScreen={compact}
            size="md"
        >
            <Stack>
                {createMutation.isError && (
                    <Alert color="orange">
                        The food could not be saved to your server. No local copy was created.
                    </Alert>
                )}
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
                <TextInput
                    label="Barcode (optional)"
                    value={barcode}
                    onChange={event => setBarcode(event.currentTarget.value)}
                />

                <Text fw={650} mt="xs">
                    Serving
                </Text>
                <SimpleGrid cols={{ base: 1, xs: 2 }}>
                    <TextInput
                        label="Serving label"
                        placeholder="e.g. cup, scoop, container"
                        value={servingName}
                        onChange={event => setServingName(event.currentTarget.value)}
                    />
                    <NumberInput
                        label="Serving weight"
                        suffix=" g"
                        hideControls
                        min={0.1}
                        value={servingGrams}
                        onChange={setServingGrams}
                    />
                </SimpleGrid>

                <FoodNutritionFields nutrients={nutrients} onChange={setNutrient} />

                <Group
                    justify="flex-end"
                    style={{
                        position: 'sticky',
                        bottom: 0,
                        zIndex: 1,
                        background: 'var(--mantine-color-body)',
                        borderTop: '1px solid var(--mantine-color-default-border)',
                        paddingTop: 'var(--mantine-spacing-sm)',
                        paddingBottom: 'var(--mantine-spacing-xs)',
                    }}
                >
                    <Button variant="default" disabled={createMutation.isPending} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        loading={createMutation.isPending}
                        disabled={!name.trim() || !servingName.trim() || Number(servingGrams) <= 0}
                        onClick={() => createMutation.mutate()}
                    >
                        Create food
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
