import { Alert, Button, Select, Skeleton, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { updatePreferences, type Preferences } from '../lib/preferencesApi'
import { useServerData } from '../hooks/useServerData'

export function PreferencesPanel({ onSaved }: { onSaved?: () => void }) {
    const { preferences, loading } = useServerData()
    const [value, setValue] = useState<Preferences | null>(preferences)
    const [message, setMessage] = useState('')
    const [saving, setSaving] = useState(false)
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const detectedLocale = Intl.DateTimeFormat().resolvedOptions().locale
    const timezones =
        typeof Intl.supportedValuesOf === 'function'
            ? Intl.supportedValuesOf('timeZone')
            : [detectedTimezone]
    const locales = [...new Set([detectedLocale, 'en-US', 'en-GB', 'nl-NL', 'de-DE', 'fr-FR'])]

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
                {message || 'Preferences are unavailable. Connect to the server and retry.'}
            </Alert>
        )

    const save = async () => {
        setSaving(true)
        setMessage('')
        try {
            setValue(await updatePreferences(value))
            setMessage('Preferences saved.')
            onSaved?.()
        } catch {
            setMessage('Preferences could not be saved. Check the connection and try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Stack>
            <TextInput
                required
                label="Display name"
                value={value.displayName}
                onChange={event => setValue({ ...value, displayName: event.currentTarget.value })}
            />
            <Select
                label="Units"
                value={value.units}
                onChange={units =>
                    units && setValue({ ...value, units: units as Preferences['units'] })
                }
                data={[
                    { label: 'Metric', value: 'metric' },
                    { label: 'Imperial', value: 'imperial' },
                ]}
            />
            <Select
                label="Timezone"
                description={`Browser recommendation: ${detectedTimezone}. Changing this can move records between days.`}
                value={value.timezone}
                onChange={timezone => timezone && setValue({ ...value, timezone })}
                data={timezones}
                searchable
            />
            <Select
                label="Locale"
                description={`Browser recommendation: ${detectedLocale}`}
                value={value.locale}
                onChange={locale => locale && setValue({ ...value, locale })}
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
                <Text size="sm">
                    {new Intl.NumberFormat(value.locale, { maximumFractionDigits: 1 }).format(
                        value.units === 'metric' ? 83.5 : 184.1,
                    )}{' '}
                    {value.units === 'metric' ? 'kg' : 'lb'}
                </Text>
            </div>
            {message && (
                <Alert color={message.endsWith('saved.') ? 'teal' : 'orange'}>{message}</Alert>
            )}
            <Button
                loading={saving}
                disabled={
                    !value.displayName.trim() || !value.timezone.trim() || !value.locale.trim()
                }
                onClick={() => void save()}
            >
                Save changes
            </Button>
        </Stack>
    )
}
