import { useEffect, useMemo, useState } from 'react'
import { Button, Notification } from '@mantine/core'
import { IconBell } from '@tabler/icons-react'
import { useServerData } from '../hooks/useServerData'
import type { LogActionId } from '../logging/logActions'

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`

export function ReminderPrompt({ open }: { open: (kind: LogActionId) => void }) {
    const { preferences } = useServerData()
    const [now, setNow] = useState(() => new Date())
    const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
    const reminders = useMemo(
        () => preferences?.experience?.reminders ?? [],
        [preferences?.experience?.reminders],
    )
    const today = dayKey(now)
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const reminder = useMemo(
        () =>
            reminders.find(item => {
                const [hours, minutes] = item.time.split(':').map(Number)
                return (
                    item.enabled &&
                    hours * 60 + minutes <= currentMinutes &&
                    !dismissed.has(`${today}:${item.id}`)
                )
            }) ?? null,
        [currentMinutes, dismissed, reminders, today],
    )

    useEffect(() => {
        const future = reminders
            .filter(item => item.enabled)
            .map(item => {
                const [hours, minutes] = item.time.split(':').map(Number)
                const date = new Date(now)
                date.setHours(hours, minutes, 0, 0)
                if (date <= now) date.setDate(date.getDate() + 1)
                return date.getTime()
            })
        const nextMidnight = new Date(now)
        nextMidnight.setDate(nextMidnight.getDate() + 1)
        nextMidnight.setHours(0, 0, 1, 0)
        const next = Math.min(nextMidnight.getTime(), ...future)
        const timer = window.setTimeout(() => setNow(new Date()), Math.max(250, next - Date.now()))
        return () => window.clearTimeout(timer)
    }, [now, reminders])

    if (!reminder) return null
    const dismiss = () => {
        setDismissed(current => new Set([...current, `${today}:${reminder.id}`]))
        setNow(new Date())
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
                    open(
                        reminder.kind === 'Meal'
                            ? 'food'
                            : reminder.kind === 'Water'
                              ? 'water'
                              : reminder.kind === 'Weight'
                                ? 'weight'
                                : reminder.kind === 'Check-in'
                                  ? 'energy'
                                  : 'journal',
                    )
                    dismiss()
                }}
            >
                Add now
            </Button>
        </Notification>
    )
}
