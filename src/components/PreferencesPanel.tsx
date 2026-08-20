import { Alert, Button, Loader, Select, Stack, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { getPreferences, updatePreferences, type Preferences } from '../lib/preferencesApi'

export function PreferencesPanel({ onSaved }: { onSaved?: () => void }) {
    const [value, setValue] = useState<Preferences | null>(null)
    const [message, setMessage] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        void getPreferences()
            .then(setValue)
            .catch(error => setMessage(error instanceof Error ? error.message : 'Load failed'))
    }, [])

    if (!value && !message) return <Loader role="status" aria-label="Loading preferences" />
    if (!value) return <Alert color="orange">{message}</Alert>

    const save = async () => {
        setSaving(true)
        setMessage('')
        try {
            setValue(await updatePreferences(value))
            setMessage('Preferences saved.')
            onSaved?.()
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Save failed')
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
            <TextInput
                required
                label="Timezone"
                description="IANA name, for example Europe/Amsterdam"
                value={value.timezone}
                onChange={event => setValue({ ...value, timezone: event.currentTarget.value })}
            />
            <TextInput
                required
                label="Locale"
                description="BCP 47 tag, for example en-GB"
                value={value.locale}
                onChange={event => setValue({ ...value, locale: event.currentTarget.value })}
            />
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
