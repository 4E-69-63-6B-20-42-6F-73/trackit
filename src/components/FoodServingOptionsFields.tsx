import { ActionIcon, Button, Group, NumberInput, Stack, Text, TextInput } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { ServingOptionDraft } from '../domain/foodServingOptions'

export function FoodServingOptionsFields({
    options,
    onChange,
}: {
    options: ServingOptionDraft[]
    onChange: (options: ServingOptionDraft[]) => void
}) {
    const update = (id: string, changes: Partial<ServingOptionDraft>) =>
        onChange(options.map(option => (option.id === id ? { ...option, ...changes } : option)))

    return (
        <Stack gap="sm">
            <div>
                <Text fw={650}>Quick serving options</Text>
                <Text size="sm" c="dimmed">
                    Optional shortcuts for logging, such as “½ cup”, “1 bottle”, or “2 slices”.
                </Text>
            </div>
            {options.map((option, index) => (
                <Group key={option.id} align="flex-end" wrap="nowrap">
                    <TextInput
                        label={index === 0 ? 'Option label' : undefined}
                        placeholder="e.g. ½ cup"
                        value={option.label}
                        onChange={event => update(option.id, { label: event.currentTarget.value })}
                        style={{ flex: 1 }}
                    />
                    <NumberInput
                        label={index === 0 ? 'Weight' : undefined}
                        aria-label={index === 0 ? undefined : `Serving option ${index + 1} weight`}
                        suffix=" g"
                        hideControls
                        min={0.1}
                        value={option.grams}
                        onChange={grams => update(option.id, { grams })}
                        style={{ width: 130 }}
                    />
                    <ActionIcon
                        variant="subtle"
                        color="red"
                        size="lg"
                        aria-label={`Remove ${option.label || `serving option ${index + 1}`}`}
                        onClick={() => onChange(options.filter(item => item.id !== option.id))}
                    >
                        <IconTrash size={17} />
                    </ActionIcon>
                </Group>
            ))}
            <Button
                type="button"
                variant="subtle"
                color="trackit"
                leftSection={<IconPlus size={16} />}
                onClick={() =>
                    onChange([...options, { id: crypto.randomUUID(), label: '', grams: '' }])
                }
            >
                Add serving option
            </Button>
        </Stack>
    )
}
