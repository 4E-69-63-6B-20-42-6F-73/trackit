import { useMemo } from 'react'
import { Button, Group, Text } from '@mantine/core'
import { IconCalendarStats } from '@tabler/icons-react'
import type { JournalEvent } from '../domain/types'
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
    if (!preferences || preferences.experience?.dismissedWeeklyReflection === currentWeek)
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
                    onClick={async () => {
                        await updatePreferences({
                            experience: {
                                ...preferences.experience,
                                dismissedWeeklyReflection: currentWeek,
                            },
                        })
                    }}
                >
                    Not this week
                </Button>
            </Group>
        </section>
    )
}
