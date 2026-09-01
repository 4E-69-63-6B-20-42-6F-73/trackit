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
import { useState } from 'react'
import {
    servingOptionsFromDrafts,
    type ServingOptionDraft,
} from '../domain/foodServingOptions'
import { foodNutrientKeys, type Food, type Nutrients } from '../domain/nutrition'
import { createFood } from '../lib/nutritionApi'
import { FoodNutritionFields } from './FoodNutritionFields'
import { FoodServingOptionsFields } from './FoodServingOptionsFields'
import { useToast } from './toastContext'

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
    const toast = useToast()
    const [name, setName] = useState('')
    const [brand, setBrand] = useState('')
    const [barcode, setBarcode] = useState('')
    const [servingName, setServingName] = useState('serving')
    const [servingGrams, setServingGrams] = useState<number | string>(100)
    const [servingOptions, setServingOptions] = useState<ServingOptionDraft[]>([])
    const [nutrients, setNutrients] = useState<Partial<Nutrients>>({})
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const setNutrient = (key: keyof Nutrients, value: number | string) => {
        setNutrients(current => {
            const next = { ...current }
            if (value === '') delete next[key]
            else next[key] = Number(value)
            return next
        })
    }

    const save = async () => {
        setSaving(true)
        setError('')
        try {
            const food = await createFood({
                name: name.trim(),
                brand: brand.trim() || undefined,
                barcode: barcode.trim() || undefined,
                per100g: nutrients,
                servingName: servingName.trim(),
                servingGrams: Number(servingGrams),
                servingOptions: servingOptionsFromDrafts(servingOptions),
                favorite: false,
                nutritionQuality: foodNutrientKeys.every(key => nutrients[key] !== undefined)
                    ? 'complete'
                    : 'incomplete',
            })
            onCreate(food)
            toast.success(`${food.name} added to your food library.`)
            setName('')
            setBrand('')
            setBarcode('')
            setServingName('serving')
            setServingGrams(100)
            setServingOptions([])
            setNutrients({})
            onClose()
        } catch {
            const message = 'The food could not be saved to your server. No local copy was created.'
            setError(message)
            toast.error(message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Create food"
            centered={!compact}
            fullScreen={compact}
            size="md"
            className="food-editor-modal"
        >
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
                <TextInput
                    label="Barcode (optional)"
                    value={barcode}
                    onChange={event => setBarcode(event.currentTarget.value)}
                />

                <div>
                    <Text fw={650} mt="xs">
                        Serving
                    </Text>
                    <Text size="sm" c="dimmed">
                        Serving size is a logging shortcut. Nutrition values below always describe
                        100 g.
                    </Text>
                </div>
                <SimpleGrid cols={{ base: 1, xs: 2 }}>
                    <TextInput
                        label="Default serving label"
                        placeholder="e.g. cup, scoop, container"
                        value={servingName}
                        onChange={event => setServingName(event.currentTarget.value)}
                    />
                    <NumberInput
                        label="Default serving weight"
                        suffix=" g"
                        hideControls
                        min={0.1}
                        value={servingGrams}
                        onChange={setServingGrams}
                    />
                </SimpleGrid>

                <FoodServingOptionsFields options={servingOptions} onChange={setServingOptions} />

                <FoodNutritionFields nutrients={nutrients} onChange={setNutrient} />

                <Group justify="flex-end" className="food-editor-actions">
                    <Button variant="default" disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        loading={saving}
                        disabled={!name.trim() || !servingName.trim() || Number(servingGrams) <= 0}
                        onClick={() => void save()}
                    >
                        Create food
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
