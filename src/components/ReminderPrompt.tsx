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
        let timer: number | undefined
        let active = true
        const schedule = () => {
            if (timer !== undefined) window.clearTimeout(timer)
            void getPreferences()
                .then(preferences => {
                    if (!active) return
                    const enabled = (preferences.experience?.reminders ?? []).filter(
                        item => item.enabled && !dismissed.has(item.id),
                    )
                    if (!enabled.length) return
                    const formatter = new Intl.DateTimeFormat('en-GB', {
                        timeZone: preferences.timezone,
                        hour: '2-digit',
                        minute: '2-digit',
                        hourCycle: 'h23',
                    })
                    const now = Date.now()
                    let next: { delay: number; item: (typeof enabled)[number] } | null = null
                    for (let minute = 0; minute <= 24 * 60; minute += 1) {
                        const candidate = new Date(now + minute * 60_000)
                        const time = formatter.format(candidate)
                        const item = enabled.find(value => value.time === time)
                        if (item) {
                            next = { delay: Math.max(0, candidate.getTime() - now), item }
                            break
                        }
                    }
                    if (next)
                        timer = window.setTimeout(
                            () => active && setReminder(next!.item),
                            next.delay,
                        )
                })
                .catch(() => undefined)
        }
        schedule()
        window.addEventListener('trackit:preferences-changed', schedule)
        return () => {
            active = false
            if (timer !== undefined) window.clearTimeout(timer)
            window.removeEventListener('trackit:preferences-changed', schedule)
        }
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
