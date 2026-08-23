import { useEffect, useState } from 'react'
import { Button, Notification } from '@mantine/core'
import { IconBell } from '@tabler/icons-react'
import { getPreferences } from '../lib/preferencesApi'
import type { QuickAddKind } from './QuickAdd'

export function ReminderPrompt({ open }: { open: (kind: QuickAddKind) => void }) {
    const [reminder, setReminder] = useState<{
        id: string
        label: string
        kind: QuickAddKind
    } | null>(null)
    const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())

    useEffect(() => {
        const check = () => {
            void getPreferences()
                .then(preferences => {
                    const now = new Date()
                    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
                    const due = (preferences.experience?.reminders ?? []).find(
                        item => item.enabled && item.time <= current && !dismissed.has(item.id),
                    )
                    setReminder(due ?? null)
                })
                .catch(() => undefined)
        }
        check()
        const timer = window.setInterval(check, 60_000)
        return () => window.clearInterval(timer)
    }, [dismissed])

    if (!reminder) return null
    const dismiss = () => {
        setDismissed(current => new Set([...current, reminder.id]))
        setReminder(null)
    }

    return (
        <Notification
            className="reminder-prompt"
            icon={<IconBell size={18} />}
            color="trackit"
            title={reminder.label}
            onClose={dismiss}
        >
            A gentle reminder from your TrackIt server settings.
            <Button
                ml="xs"
                size="compact-xs"
                variant="subtle"
                onClick={() => {
                    open(reminder.kind)
                    dismiss()
                }}
            >
                Add now
            </Button>
        </Notification>
    )
}
