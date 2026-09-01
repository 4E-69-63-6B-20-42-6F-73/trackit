import { Alert, Button, Select, Skeleton, Stack, Text, TextInput } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { updatePreferences, type Preferences } from '../lib/preferencesApi'
import { useServerData } from '../hooks/useServerData'

export function PreferencesPanel({ onSaved }: { onSaved?: () => void }) {
    const { preferences, loading } = useServerData()
    const [value, setValue] = useState<Preferences | null>(preferences)
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const detectedLocale = Intl.DateTimeFormat().resolvedOptions().locale
    const timezones =
        typeof Intl.supportedValuesOf === 'function'
            ? Intl.supportedValuesOf('timeZone')
            : [detectedTimezone]
    const locales = [...new Set([detectedLocale, 'en-US', 'en-GB', 'nl-NL', 'de-DE', 'fr-FR'])]
    const accessibleDescriptionStyles = { description: { color: 'var(--muted)' } }

    const saveMutation = useMutation({
        mutationFn: async (next: Preferences) =>
            updatePreferences({
                displayName: next.displayName,
                timezone: next.timezone,
                locale: next.locale,
            }),
        onSuccess: saved => {
            setValue(saved)
            onSaved?.()
        },
    })

    useEffect(() => {
        queueMicrotask(() => setValue(preferences))
    }, [preferences])

    if (loading && !value)
        return (
            <Stack role="status" aria-label="Loading preferences">
                <Skeleton height={58} />
                <Skeleton height={58} />
                <Skeleton height={58} />
                <Skeleton height={36} />
            </Stack>
        )
    if (!value)
        return (
            <Alert color="orange">
                {saveMutation.isError
                    ? 'Preferences could not be saved. Check the connection and try again.'
                    : 'Preferences are unavailable. Connect to the server and retry.'}
            </Alert>
        )

    return (
        <Stack>
            <TextInput
                required
                label="Display name"
                value={value.displayName}
                onChange={event => {
                    saveMutation.reset()
                    setValue({ ...value, displayName: event.currentTarget.value })
                }}
            />
            <Select
                label="Timezone"
                description={`Browser recommendation: ${detectedTimezone}. Changing this can move observations between days.`}
                styles={accessibleDescriptionStyles}
                value={value.timezone}
                onChange={timezone => {
                    if (!timezone) return
                    saveMutation.reset()
                    setValue({ ...value, timezone })
                }}
                data={timezones}
                searchable
            />
            <Select
                label="Locale"
                description={`Browser recommendation: ${detectedLocale}`}
                styles={accessibleDescriptionStyles}
                value={value.locale}
                onChange={locale => {
                    if (!locale) return
                    saveMutation.reset()
                    setValue({ ...value, locale })
                }}
                data={locales}
                searchable
            />
            <div className="preference-preview">
                <Text size="xs" c="dimmed">
                    Formatting preview
                </Text>
                <Text size="sm" fw={600}>
                    {new Intl.DateTimeFormat(value.locale, {
                        dateStyle: 'full',
                        timeStyle: 'short',
                        timeZone: value.timezone,
                    }).format(new Date())}
                </Text>
            </div>
            {saveMutation.isSuccess && <Alert color="teal">Preferences saved.</Alert>}
            {saveMutation.isError && (
                <Alert color="orange">
                    Preferences could not be saved. Check the connection and try again.
                </Alert>
            )}
            <Button
                loading={saveMutation.isPending}
                disabled={
                    !value.displayName.trim() || !value.timezone.trim() || !value.locale.trim()
                }
                onClick={() => saveMutation.mutate(value)}
            >
                Save changes
            </Button>
        </Stack>
    )
}
