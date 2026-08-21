import {
    IconActivity,
    IconApple,
    IconDashboard,
    IconLink,
    IconMoon,
    IconNotes,
    IconScale,
    IconSparkles,
    IconTargetArrow,
    IconTrendingUp,
} from '@tabler/icons-react'
import type { Category, JournalEvent, Page } from './types'

export const trend = [
    { day: 'Fri', sleep: 6.7, energy: 5 },
    { day: 'Sat', sleep: 7.2, energy: 6 },
    { day: 'Sun', sleep: 7.9, energy: 8 },
    { day: 'Mon', sleep: 6.4, energy: 5 },
    { day: 'Tue', sleep: 7.1, energy: 7 },
    { day: 'Wed', sleep: 7.4, energy: 7 },
    { day: 'Thu', sleep: 7.63, energy: 8 },
]

export const initialEvents: JournalEvent[] = [
    {
        id: '10000000-0000-4000-8000-000000000001',
        time: '12:40',
        category: 'Check-ins',
        title: 'Energy check-in',
        detail: '8 out of 10',
        source: 'You',
    },
    {
        id: '10000000-0000-4000-8000-000000000002',
        time: '09:02',
        category: 'Activity',
        title: 'Morning walk',
        detail: '24 min · 2.1 km',
        source: 'Health Connect',
    },
    {
        id: '10000000-0000-4000-8000-000000000003',
        time: '08:10',
        category: 'Meals',
        title: 'Breakfast',
        detail: 'Oats, yoghurt & berries · 510 kcal',
        source: 'You',
    },
    {
        id: '10000000-0000-4000-8000-000000000004',
        time: '07:48',
        category: 'Sleep',
        title: 'Sleep',
        detail: '7h 38m · 91% efficiency',
        source: 'Health Connect',
    },
]

export const eventVisual = (category: Category) =>
    category === 'Meals'
        ? { icon: IconApple, tone: 'amber' }
        : category === 'Activity'
          ? { icon: IconActivity, tone: 'green' }
          : category === 'Sleep'
            ? { icon: IconMoon, tone: 'indigo' }
            : category === 'Measurements'
              ? { icon: IconScale, tone: 'blue' }
              : { icon: IconSparkles, tone: 'violet' }

export const nav: { label: Page; icon: typeof IconDashboard }[] = [
    { label: 'Today', icon: IconDashboard },
    { label: 'Nutrition', icon: IconApple },
    { label: 'Journal', icon: IconNotes },
    { label: 'Goals', icon: IconTargetArrow },
    { label: 'Trends', icon: IconTrendingUp },
    { label: 'Connections', icon: IconLink },
]
