import {
    IconActivity,
    IconApple,
    IconCalendarWeek,
    IconDashboard,
    IconMoon,
    IconNotes,
    IconScale,
    IconSparkles,
    IconTargetArrow,
    IconTrendingUp,
} from '@tabler/icons-react'
import type { Category, Page } from './types'

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
    { label: 'Plan', icon: IconCalendarWeek },
    { label: 'Journal', icon: IconNotes },
    { label: 'Trends', icon: IconTrendingUp },
    { label: 'Goals', icon: IconTargetArrow },
    { label: 'Library', icon: IconApple },
]
