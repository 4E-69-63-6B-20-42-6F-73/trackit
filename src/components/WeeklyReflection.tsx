import { useMemo } from 'react'
import { Button, Group, Text } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { IconCalendarStats } from '@tabler/icons-react'
import type { JournalEvent } from '@trackit/domain/types'
import { updatePreferences } from '../lib/preferencesApi'
import { useServerData } from '../hooks/useServerData'

const weekKey = () => {
    const date = new Date()
    const start = new Date(date)
    start.setDate(date.getDate() - ((date.getDay() + 6) % 7))
    return start.toISOString().slice(0, 10)
}

export function WeeklyReflection({
    events,
    openJournal,
}: {
    events: JournalEvent[]
    openJournal: () => void
}) {
    const { preferences } = useServerData()
    const currentWeek = weekKey()
    const recent = useMemo(() => {
        const from = new Date(`${currentWeek}T00:00:00`).getTime()
        return events.filter(
            event => !event.observedAt || new Date(event.observedAt).getTime() >= from,
        )
    }, [currentWeek, events])
    const dismissMutation = useMutation({
        mutationFn: () => {
            if (!preferences) throw new Error('Preferences unavailable')
            return updatePreferences({
                experience: {
                    ...preferences.experience,
                    dismissedWeeklyReflection: currentWeek,
                },
            })
        },
    })

    if (
        !preferences ||
        preferences.experience?.dismissedWeeklyReflection === currentWeek ||
        dismissMutation.isSuccess
    )
        return null
    const categories = new Set(recent.map(event => event.category)).size
    return (
        <section className="weekly-reflection">
            <IconCalendarStats size={24} />
            <div>
                <Text className="eyebrow teal-text">YOUR WEEK</Text>
                <Text fw={700}>A calm look back</Text>
                <Text size="sm" c="dimmed">
                    You recorded {recent.length} {recent.length === 1 ? 'entry' : 'entries'} across{' '}
                    {categories} {categories === 1 ? 'area' : 'areas'}. Review the context, not a
                    score or streak.
                </Text>
            </div>
            <Group gap="xs">
                <Button size="xs" variant="default" onClick={openJournal}>
                    Review week
                </Button>
                <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    loading={dismissMutation.isPending}
                    onClick={() => dismissMutation.mutate()}
                >
                    Not this week
                </Button>
            </Group>
        </section>
    )
}
