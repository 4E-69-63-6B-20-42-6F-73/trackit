import { Fragment } from 'react'
import { ActionIcon, Button, Group, Menu, Skeleton, Text } from '@mantine/core'
import {
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconDots,
    IconEdit,
    IconPlus,
    IconRestore,
    IconTrash,
    IconX,
} from '@tabler/icons-react'
import { formatCalendarDate } from '@trackit/domain/calendar'
import {
    addPlanDays,
    formatPlanAmount,
    formatPlanProgress,
    planStatus,
    type MealPlanItem,
    type MealType,
    weekStartKey,
} from '@trackit/domain/planning'

const mealTypes: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

const mealDescriptions: Record<MealType, string> = {
    Breakfast: 'Start the day',
    Lunch: 'Midday meal',
    Dinner: 'Evening meal',
    Snack: 'Between meals',
}

export type PlanBoardViewProps = {
    compact: boolean
    loading: boolean
    dates: string[]
    todayKey: string
    selectedDate: string
    weekStart: string
    weekLabel: string
    locale?: string
    items: MealPlanItem[]
    schedulesCount: number
    onNavigateDate: (date: string) => void
    onOpenSchedules: () => void
    onAdd: (date: string, mealType: MealType) => void
    onEdit: (item: MealPlanItem) => void
    onLog: (item: MealPlanItem) => void
    onSkip: (item: MealPlanItem) => void
    onRestore: (item: MealPlanItem) => void
    onDelete: (item: MealPlanItem) => void
}

function mealTypeLabel(item: MealPlanItem) {
    if (item.meal.reference.type === 'recipe') return 'Recipe'
    if (item.meal.reference.type === 'category') return 'Food group'
    return 'Food'
}

function PlanMealCard({
    item,
    onEdit,
    onLog,
    onSkip,
    onRestore,
    onDelete,
}: {
    item: MealPlanItem
    onEdit: (item: MealPlanItem) => void
    onLog: (item: MealPlanItem) => void
    onSkip: (item: MealPlanItem) => void
    onRestore: (item: MealPlanItem) => void
    onDelete: (item: MealPlanItem) => void
}) {
    const status = planStatus(item)
    return (
        <div className={`plan-meal-card plan-meal-card-${status}`}>
            <div className="plan-meal-title">{item.meal.reference.name}</div>
            <div className="plan-meal-meta">
                <span>
                    {item.scheduledTime && (
                        <span className="plan-meal-time">{item.scheduledTime} · </span>
                    )}
                    {item.meal.reference.type === 'category' && item.meal.fulfilledAmount > 0
                        ? formatPlanProgress(item)
                        : formatPlanAmount(item)}{' '}
                    · {mealTypeLabel(item)}
                </span>
                {status === 'logged' && (
                    <span className="plan-meal-status">
                        <IconCheck size={11} />
                        {item.meal.reference.type === 'category' ? 'Complete' : 'Logged'}
                    </span>
                )}
                {status === 'partial' && (
                    <span className="plan-meal-status plan-meal-status-partial">In progress</span>
                )}
                {status === 'skipped' && (
                    <span className="plan-meal-status plan-meal-status-skipped">Skipped</span>
                )}
            </div>
            <Menu position="bottom-end" shadow="md">
                <Menu.Target>
                    <ActionIcon
                        className="plan-meal-menu"
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label={`Actions for ${item.meal.reference.name}`}
                    >
                        <IconDots size={16} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    {(status === 'planned' || status === 'partial') && (
                        <Menu.Item leftSection={<IconCheck size={15} />} onClick={() => onLog(item)}>
                            {item.meal.reference.type === 'category' ? 'Log progress' : 'Log as eaten'}
                        </Menu.Item>
                    )}
                    {(status === 'planned' || status === 'skipped') && (
                        <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => onEdit(item)}>
                            Edit or move
                        </Menu.Item>
                    )}
                    {status === 'planned' && (
                        <Menu.Item leftSection={<IconX size={15} />} onClick={() => onSkip(item)}>
                            Skip
                        </Menu.Item>
                    )}
                    {status === 'skipped' && (
                        <Menu.Item leftSection={<IconRestore size={15} />} onClick={() => onRestore(item)}>
                            Restore
                        </Menu.Item>
                    )}
                    <Menu.Divider />
                    <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={15} />}
                        onClick={() => onDelete(item)}
                    >
                        Remove from plan
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </div>
    )
}

function slotItems(items: MealPlanItem[], date: string, mealType: MealType) {
    return items
        .filter(item => item.scheduledDate === date && item.meal.mealType === mealType)
        .sort(
            (left, right) =>
                (left.scheduledTime ?? '99:99').localeCompare(right.scheduledTime ?? '99:99') ||
                left.position - right.position,
        )
}

function DesktopPlan(props: Omit<PlanBoardViewProps, 'compact' | 'loading' | 'schedulesCount' | 'weekLabel' | 'weekStart' | 'onOpenSchedules' | 'onNavigateDate'>) {
    const { dates, todayKey, locale, items, onAdd, onEdit, onLog, onSkip, onRestore, onDelete } = props
    return (
        <>
            <div className="plan-board">
                <div className="plan-grid">
                    <div className="plan-grid-corner">
                        <span className="plan-grid-corner-label">Weekly plan</span>
                    </div>
                    {dates.map(date => {
                        const isToday = date === todayKey
                        return (
                            <div
                                key={`header-${date}`}
                                className={`plan-day-header${isToday ? ' plan-day-header-today' : ''}`}
                            >
                                <div className="plan-day-name">
                                    {isToday
                                        ? 'Today'
                                        : formatCalendarDate(date, locale, { weekday: 'short' })}
                                </div>
                                <div className="plan-day-number">
                                    {formatCalendarDate(date, locale, { day: 'numeric' })}
                                </div>
                                {isToday && (
                                    <span className="plan-today-chip">
                                        {formatCalendarDate(date, locale, { weekday: 'short' }).toUpperCase()}
                                    </span>
                                )}
                            </div>
                        )
                    })}
                    {mealTypes.map(mealType => (
                        <Fragment key={mealType}>
                            <div className="plan-meal-label">
                                <strong className="plan-meal-label-name">{mealType}</strong>
                                <span className="plan-meal-label-description">{mealDescriptions[mealType]}</span>
                            </div>
                            {dates.map(date => {
                                const planned = slotItems(items, date, mealType)
                                const isToday = date === todayKey
                                return (
                                    <div
                                        key={`${date}-${mealType}`}
                                        className={`plan-slot${isToday ? ' plan-slot-today' : ''}${planned.length === 0 ? ' plan-slot-empty' : ''}`}
                                    >
                                        {planned.map(item => (
                                            <PlanMealCard
                                                key={item.id}
                                                item={item}
                                                onEdit={onEdit}
                                                onLog={onLog}
                                                onSkip={onSkip}
                                                onRestore={onRestore}
                                                onDelete={onDelete}
                                            />
                                        ))}
                                        {planned.length === 0 ? (
                                            <button
                                                type="button"
                                                className="plan-add-cell"
                                                onClick={() => onAdd(date, mealType)}
                                                aria-label={`Add ${mealType.toLowerCase()} on ${formatCalendarDate(date, locale, { month: 'short', day: 'numeric' })}`}
                                            >
                                                <IconPlus size={14} />
                                                Add
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="plan-add-another"
                                                onClick={() => onAdd(date, mealType)}
                                            >
                                                + Add another
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </Fragment>
                    ))}
                </div>
            </div>
            <div className="plan-legend" aria-label="Meal plan legend">
                <span className="plan-legend-item">
                    <span className="plan-legend-dot" />
                    Planned meals are intentions
                </span>
                <span className="plan-legend-item">
                    <IconCheck size={13} />
                    Flexible food groups can be completed across multiple foods
                </span>
            </div>
        </>
    )
}

function MobilePlan(props: Omit<PlanBoardViewProps, 'compact' | 'loading' | 'schedulesCount' | 'weekLabel' | 'weekStart' | 'onOpenSchedules'>) {
    const {
        dates,
        todayKey,
        selectedDate,
        locale,
        items,
        onNavigateDate,
        onAdd,
        onEdit,
        onLog,
        onSkip,
        onRestore,
        onDelete,
    } = props
    return (
        <>
            <div className="plan-mobile-strip">
                <div className="plan-mobile-days">
                    {dates.map(date => {
                        const isToday = date === todayKey
                        const isSelected = date === selectedDate
                        return (
                            <button
                                key={date}
                                type="button"
                                className={`plan-mobile-day${isSelected ? ' plan-mobile-day-selected' : ''}${isToday ? ' plan-mobile-day-today' : ''}`}
                                onClick={() => onNavigateDate(date)}
                                aria-current={isSelected ? 'date' : undefined}
                            >
                                <span className="plan-mobile-day-name">
                                    {isToday
                                        ? 'Today'
                                        : formatCalendarDate(date, locale, { weekday: 'short' })}
                                </span>
                                <span className="plan-mobile-day-number">
                                    {formatCalendarDate(date, locale, { day: 'numeric' })}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>
            <div className="plan-mobile-heading">
                <div className="plan-mobile-eyebrow">
                    {selectedDate === todayKey
                        ? 'Today'
                        : formatCalendarDate(selectedDate, locale, { weekday: 'long' })}
                </div>
                <h2>{formatCalendarDate(selectedDate, locale, { month: 'long', day: 'numeric' })}</h2>
            </div>
            {mealTypes.map(mealType => {
                const planned = slotItems(items, selectedDate, mealType)
                return (
                    <section className="plan-mobile-section" key={mealType}>
                        <div className="plan-mobile-section-header">
                            <strong>{mealType}</strong>
                            <button
                                type="button"
                                className="plan-mobile-add"
                                onClick={() => onAdd(selectedDate, mealType)}
                            >
                                + Add
                            </button>
                        </div>
                        {planned.length ? (
                            <div className="plan-mobile-list">
                                {planned.map(item => (
                                    <div className="plan-mobile-card" key={item.id}>
                                        <PlanMealCard
                                            item={item}
                                            onEdit={onEdit}
                                            onLog={onLog}
                                            onSkip={onSkip}
                                            onRestore={onRestore}
                                            onDelete={onDelete}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="plan-mobile-empty">Nothing planned yet.</div>
                        )}
                    </section>
                )
            })}
        </>
    )
}

export function PlanBoardView(props: PlanBoardViewProps) {
    const { compact, loading, weekStart, todayKey, weekLabel, schedulesCount, onNavigateDate, onOpenSchedules } = props
    return (
        <>
            <div className="plan-toolbar">
                <div className="plan-week-nav">
                    <ActionIcon
                        variant="default"
                        aria-label="Previous week"
                        onClick={() => onNavigateDate(addPlanDays(weekStart, -7))}
                    >
                        <IconChevronLeft size={17} />
                    </ActionIcon>
                    <Text className="plan-week-label" fw={700}>
                        {weekLabel}
                    </Text>
                    <ActionIcon
                        variant="default"
                        aria-label="Next week"
                        onClick={() => onNavigateDate(addPlanDays(weekStart, 7))}
                    >
                        <IconChevronRight size={17} />
                    </ActionIcon>
                </div>
                <Group gap="xs">
                    <Button variant="default" size="sm" onClick={onOpenSchedules}>
                        Schedules{schedulesCount ? ` (${schedulesCount})` : ''}
                    </Button>
                    {weekStart !== weekStartKey(todayKey) && (
                        <Button variant="default" size="sm" onClick={() => onNavigateDate(todayKey)}>
                            This week
                        </Button>
                    )}
                </Group>
            </div>
            {loading ? (
                <Skeleton height={compact ? 420 : 540} radius="lg" />
            ) : compact ? (
                <MobilePlan {...props} />
            ) : (
                <DesktopPlan {...props} />
            )}
        </>
    )
}
