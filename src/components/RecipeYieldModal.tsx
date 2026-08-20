import { useState } from 'react'
import { Alert, Button, Modal, NumberInput, Stack, Text } from '@mantine/core'
import type { RecipeRecord } from '../lib/nutritionApi'

export function RecipeYieldModal({
    recipe,
    onClose,
    onSave,
}: {
    recipe: RecipeRecord
    onClose: () => void
    onSave: (servings: number) => Promise<void>
}) {
    const [servings, setServings] = useState<number | string>(recipe.servings)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const save = async () => {
        setSaving(true)
        setError('')
        try {
            await onSave(Number(servings))
            onClose()
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not update recipe yield.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal opened onClose={onClose} title={`Edit ${recipe.name} yield`}>
            <Stack>
                <Text size="sm">
                    Ingredients stay unchanged. Updating the yield recalculates future serving
                    totals; meals already logged keep their nutrient snapshot.
                </Text>
                <NumberInput
                    label="Recipe yield (servings)"
                    value={servings}
                    onChange={setServings}
                    min={0.1}
                    decimalScale={1}
                />
                {error && <Alert color="orange">{error}</Alert>}
                <Button loading={saving} onClick={() => void save()}>
                    Recalculate servings
                </Button>
            </Stack>
        </Modal>
    )
}
