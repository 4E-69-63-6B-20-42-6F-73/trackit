import { useState } from 'react'
import { Alert, Button, Modal, NumberInput, Stack, Text } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
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
    const saveMutation = useMutation({
        mutationFn: () => onSave(Number(servings)),
        onSuccess: onClose,
    })
    const error = saveMutation.isError
        ? saveMutation.error instanceof Error
            ? saveMutation.error.message
            : 'Could not update recipe yield.'
        : ''

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
                <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                    Recalculate servings
                </Button>
            </Stack>
        </Modal>
    )
}
