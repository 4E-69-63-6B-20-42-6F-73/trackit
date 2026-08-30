import { Fragment, useEffect, useState } from 'react'
import {
    ActionIcon,
    Alert,
    Button,
    Divider,
    Group,
    Menu,
    Modal,
    NumberInput,
    Paper,
    Select,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
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
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import {
    calendarLocalDateTimeToInstant,
    calendarLocalDateTimeValue,
    calendarTodayKey,
    formatCalendarDate,
} from '../domain/calendar'
import { nutrientsFor, roundedNutrients, type Food, type Nutrients } from '../domain/nutrition'
import {
    addPlanDays,
    formatPlanAmount,
    planStatus,
    type MealPlanItem,
    type MealType,
    weekDateKeys,
    weekStartKey,
} from '../domain/planning'
import { useServerData } from '../hooks/useServerData'
import { listRecipes, searchFoods, type RecipeRecord } from '../lib/nutritionApi'
import {
    createPlanMeal,
    deletePlanMeal,
    listPlanItems,
    logPlannedMeal,
    setPlanMealSkipped,
    updatePlanMeal,
} from '../lib/planApi'
import '../plan.css'

const mealTypes: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

const mealDescriptions: Record<MealType, string> = {
    Breakfast: 'Start the day',
    Lunch: 'Midday meal',
    Dinner: 'Evening meal',
    Snack: 'Between meals',
}

type EditorState = {
    item: MealPlanItem | null
    date: string
    mealType: MealType
    selection: string | null
    amount: number | string
}

type LogState = {
    item: MealPlanItem
    recordedAt: string
    amount: number | string
}

const referenceValue = (item: MealPlanItem) =>
    `${item.meal.reference.type}:${item.meal.reference.id}`

const loadPlanWeek = (weekStart: string) => {
    const range = weekDateKeys(weekStart)
    return Promise.all([
        listPlanItems({ from: range[0], to: range[6] }),
        searchFoods(''),
        listRecipes(),
    ])
}

export function Plan() {
    const [params, setParams] = useSearchParams()
    const compact = useMediaQuery('(max-width: 62em)')
    const { preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const locale = preferences?.locale
    const todayKey = calendarTodayKey(timezone)
    const routeDate = params.get('date') ?? todayKey
    const weekStart = weekStartKey(routeDate)
    const dates = weekDateKeys(weekStart)
    const selectedDate = dates.includes(routeDate) ? routeDate : dates[0]
    const [items, setItems] = useState<MealPlanItem[]>([])
    const [foods, setFoods] = useState<Food[]>([])
    const [recipes, setRecipes] = useState<RecipeRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState('')
    const [editor, setEditor] = useState<EditorState | null>(null)
    const [logState, setLogState] = useState<LogState | null>(null)
    const [busy, setBusy] = useState(false)

    const applyLoadedWeek = ([nextItems, nextFoods, nextRecipes]: Awaited<
        ReturnType<typeof loadPlanWeek>
    >) => {
        setItems(nextItems)
        setFoods(nextFoods)
        setRecipes(nextRecipes)
        setMessage('')
    }

    const refresh = () =>
        loadPlanWeek(weekStart)
            .then(applyLoadedWeek)
            .catch(() => setMessage('Your meal plan could not be loaded from the server.'))
            .finally(() => setLoading(false))

    useEffect(() => {
        void loadPlanWeek(weekStart)
            .then(([nextItems, nextFoods, nextRecipes]) => {
                setItems(nextItems)
                setFoods(nextFoods)
                setRecipes(nextRecipes)
                setMessage('')
            })
            .catch(() => setMessage('Your meal plan could not be loaded from the server.'))
            .finally(() => setLoading(false))
    }, [weekStart])

    const navigateDate = (date: string) => {
        if (weekStartKey(date) !== weekStart) setLoading(true)
        const next = new URLSearchParams(params)
        if (date === todayKey) next.delete('date')
        else next.set('date', date)
        setParams(next, { replace: true })
    }

    const openNew = (date: string, mealType: MealType) =>
        setEditor({ item: null, date, mealType, selection: null, amount: 1 })

    const openEdit = (item: MealPlanItem) =>
        setEditor({
            item,
            date: item.scheduledDate,
            mealType: item.meal.mealType,
            selection: referenceValue(item),
            amount: item.meal.amount,
        })

    const selection = editor?.selection
    const selectedFood = selection?.startsWith('food:')
        ? foods.find(food => food.id === selection.slice(5))
        : undefined
    const selectedRecipe = selection?.startsWith('recipe:')
        ? recipes.find(recipe => recipe.id === selection.slice(7))
        : undefined
    const preview = (() => {
        const amount = Number(editor?.amount)
        if (!Number.isFinite(amount) || amount <= 0) return null
        if (selectedFood) return roundedNutrients(nutrientsFor(selectedFood, amount))
        if (selectedRecipe)
            return roundedNutrients(
                Object.fromEntries(
                    Object.entries(selectedRecipe.nutrientsPerServing).map(([key, value]) => [
                        key,
                        value * amount,
                    ]),
                ) as Nutrients,
            )
        return null
    })()

    const chooseReference = (value: string | null) => {
        if (!editor) return
        if (!value) {
            setEditor({ ...editor, selection: null })
            return
        }
        const food = value.startsWith('food:')
            ? foods.find(item => item.id === value.slice(5))
            : null
        setEditor({
            ...editor,
            selection: value,
            amount: food?.servingGrams ?? 1,
        })
    }

    const saveEditor = async () => {
        if (!editor?.selection) return
        const amount = Number(editor.amount)
        if (!Number.isFinite(amount) || amount <= 0) return
        const [type, id] = editor.selection.split(':') as ['food' | 'recipe', string]
        setBusy(true)
        try {
            if (editor.item)
                await updatePlanMeal(editor.item, {
                    scheduledDate: editor.date,
                    mealType: editor.mealType,
                    reference: { type, id },
                    amount,
                })
            else
                await createPlanMeal({
                    scheduledDate: editor.date,
                    mealType: editor.mealType,
                    reference: { type, id },
                    amount,
                })
            setEditor(null)
            window.dispatchEvent(new Event('trackit:plan-changed'))
            await refresh()
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not save this planned meal.')
        } finally {
            setBusy(false)
        }
    }

    const mutate = async (action: () => Promise<unknown>) => {
        setBusy(true)
        try {
            await action()
            window.dispatchEvent(new Event('trackit:plan-changed'))
            setMessage('')
            await refresh()
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Your plan could not be updated.')
        } finally {
            setBusy(false)
        }
    }

    const openLog = (item: MealPlanItem) => {
        const now = calendarLocalDateTimeValue(new Date(), timezone)
        const [, time] = now.split('T')
        setLogState({
            item,
            recordedAt: `${item.scheduledDate}T${item.scheduledDate === todayKey ? time : '12:00'}`,
            amount: item.meal.amount,
        })
    }

    const saveLog = async () => {
        if (!logState) return
        const amount = Number(logState.amount)
        if (!Number.isFinite(amount) || amount <= 0 || !logState.recordedAt) return
        setBusy(true)
        try {
            await logPlannedMeal(logState.item, {
                eatenAt: calendarLocalDateTimeToInstant(
                    logState.recordedAt,
                    timezone,
                ).toISOString(),
                amount,
            })
            setLogState(null)
            window.dispatchEvent(new Event('trackit:plan-changed'))
            window.dispatchEvent(new Event('trackit:nutrition-changed'))
            await refresh()
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not log this planned meal.')
        } finally {
            setBusy(false)
        }
    }

    const weekLabel = `${formatCalendarDate(dates[0], locale, { month: 'short', day: 'numeric' })} – ${formatCalendarDate(dates[6], locale, { month: 'short', day: 'numeric', year: 'numeric' })}`

    const mealCard = (item: MealPlanItem) => {
        const status = planStatus(item)
        return (
            <div key={item.id} className={`plan-meal-card plan-meal-card-${status}`}>
                <div className="plan-meal-title">{item.meal.reference.name}</div>
                <div className="plan-meal-meta">
                    <span>
                        {formatPlanAmount(item)} ·{' '}
                        {item.meal.reference.type === 'recipe' ? 'Recipe' : 'Food'}
                    </span>
                    {status === 'logged' && (
                        <span className="plan-meal-status">
                            <IconCheck size={11} />
                            Logged
                        </span>
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
                        {status === 'planned' && (
                            <Menu.Item
                                leftSection={<IconCheck size={15} />}
                                onClick={() => openLog(item)}
                            >
                                Log as eaten
                            </Menu.Item>
                        )}
                        {status !== 'logged' && (
                            <Menu.Item
                                leftSection={<IconEdit size={15} />}
                                onClick={() => openEdit(item)}
                            >
                                Edit or move
                            </Menu.Item>
                        )}
                        {status === 'planned' && (
                            <Menu.Item
                                leftSection={<IconX size={15} />}
                                onClick={() => void mutate(() => setPlanMealSkipped(item, true))}
                            >
                                Skip
                            </Menu.Item>
                        )}
                        {status === 'skipped' && (
                            <Menu.Item
                                leftSection={<IconRestore size={15} />}
                                onClick={() => void mutate(() => setPlanMealSkipped(item, false))}
                            >
                                Restore
                            </Menu.Item>
                        )}
                        <Menu.Divider />
                        <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={15} />}
                            onClick={() => void mutate(() => deletePlanMeal(item))}
                        >
                            Remove from plan
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </div>
        )
    }

    const desktopPlan = (
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
                                        : formatCalendarDate(date, locale, {
                                              weekday: 'short',
                                          })}
                                </div>
                                <div className="plan-day-number">
                                    {formatCalendarDate(date, locale, { day: 'numeric' })}
                                </div>
                                {isToday && (
                                    <span className="plan-today-chip">
                                        {formatCalendarDate(date, locale, {
                                            weekday: 'short',
                                        }).toUpperCase()}
                                    </span>
                                )}
                            </div>
                        )
                    })}
                    {mealTypes.map(mealType => (
                        <Fragment key={mealType}>
                            <div className="plan-meal-label">
                                <strong className="plan-meal-label-name">{mealType}</strong>
                                <span className="plan-meal-label-description">
                                    {mealDescriptions[mealType]}
                                </span>
                            </div>
                            {dates.map(date => {
                                const slotItems = items.filter(
                                    item =>
                                        item.scheduledDate === date &&
                                        item.meal.mealType === mealType,
                                )
                                const isToday = date === todayKey
                                return (
                                    <div
                                        key={`${date}-${mealType}`}
                                        className={`plan-slot${isToday ? ' plan-slot-today' : ''}${
                                            slotItems.length === 0 ? ' plan-slot-empty' : ''
                                        }`}
                                    >
                                        {slotItems.map(mealCard)}
                                        {slotItems.length === 0 ? (
                                            <button
                                                type="button"
                                                className="plan-add-cell"
                                                onClick={() => openNew(date, mealType)}
                                                aria-label={`Add ${mealType.toLowerCase()} on ${formatCalendarDate(
                                                    date,
                                                    locale,
                                                    { month: 'short', day: 'numeric' },
                                                )}`}
                                            >
                                                <IconPlus size={14} />
                                                Add
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="plan-add-another"
                                                onClick={() => openNew(date, mealType)}
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
                    Logged meals become health records
                </span>
            </div>
        </>
    )

    const mobilePlan = (
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
                                className={`plan-mobile-day${
                                    isSelected ? ' plan-mobile-day-selected' : ''
                                }${isToday ? ' plan-mobile-day-today' : ''}`}
                                onClick={() => navigateDate(date)}
                                aria-current={isSelected ? 'date' : undefined}
                            >
                                <span className="plan-mobile-day-name">
                                    {isToday
                                        ? 'Today'
                                        : formatCalendarDate(date, locale, {
                                              weekday: 'short',
                                          })}
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
                        : formatCalendarDate(selectedDate, locale, {
                              weekday: 'long',
                          })}
                </div>
                <h2>
                    {formatCalendarDate(selectedDate, locale, {
                        month: 'long',
                        day: 'numeric',
                    })}
                </h2>
            </div>

            {mealTypes.map(mealType => {
                const slotItems = items.filter(
                    item =>
                        item.scheduledDate === selectedDate && item.meal.mealType === mealType,
                )
                return (
                    <section key={mealType} className="plan-mobile-section">
                        <div className="plan-mobile-section-header">
                            <strong>{mealType}</strong>
                            <button
                                type="button"
                                className="plan-mobile-add"
                                onClick={() => openNew(selectedDate, mealType)}
                            >
                                + Add
                            </button>
                        </div>
                        {slotItems.length ? (
                            <div className="plan-mobile-list">
                                {slotItems.map(item => (
                                    <div key={item.id} className="plan-mobile-card">
                                        {mealCard(item)}
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

    return (
        <div className="page-content simple-page">
            <PageHeader
                title="Plan"
                description="Plan meals ahead. They become part of your health record only when logged."
            />

            <div className="plan-toolbar">
                <div className="plan-week-nav">
                    <ActionIcon
                        variant="default"
                        aria-label="Previous week"
                        onClick={() => navigateDate(addPlanDays(weekStart, -7))}
                    >
                        <IconChevronLeft size={17} />
                    </ActionIcon>
                    <Text fw={700} className="plan-week-label">
                        {weekLabel}
                    </Text>
                    <ActionIcon
                        variant="default"
                        aria-label="Next week"
                        onClick={() => navigateDate(addPlanDays(weekStart, 7))}
                    >
                        <IconChevronRight size={17} />
                    </ActionIcon>
                </div>
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => navigateDate(todayKey)}
                    disabled={weekStart === weekStartKey(todayKey)}
                >
                    This week
                </Button>
            </div>

            {message && (
                <Alert color="orange" mb="md">
                    {message}
                </Alert>
            )}

            {loading ? (
                <Skeleton height={compact ? 440 : 540} radius="lg" />
            ) : compact ? (
                mobilePlan
            ) : (
                desktopPlan
            )}

            <Modal
                opened={Boolean(editor)}
                onClose={() => !busy && setEditor(null)}
                title={
                    <Text fw={700}>{editor?.item ? 'Edit planned meal' : 'Add to meal plan'}</Text>
                }
                size="lg"
            >
                {editor && (
                    <Stack>
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <TextInput
                                type="date"
                                label="Day"
                                value={editor.date}
                                onChange={event =>
                                    setEditor({ ...editor, date: event.currentTarget.value })
                                }
                            />
                            <Select
                                label="Meal"
                                value={editor.mealType}
                                onChange={value =>
                                    value && setEditor({ ...editor, mealType: value as MealType })
                                }
                                data={mealTypes}
                            />
                        </SimpleGrid>
                        <Select
                            searchable
                            label="Food or recipe"
                            placeholder="Search your library"
                            value={editor.selection}
                            onChange={chooseReference}
                            data={[
                                ...recipes.map(recipe => ({
                                    value: `recipe:${recipe.id}`,
                                    label: `Recipe · ${recipe.name}`,
                                })),
                                ...foods.map(food => ({
                                    value: `food:${food.id}`,
                                    label: `Food · ${food.name}`,
                                })),
                            ]}
                            nothingFoundMessage="No saved food or recipe found"
                        />
                        <NumberInput
                            label={selectedRecipe ? 'Servings' : 'Amount'}
                            suffix={selectedFood ? ' g' : undefined}
                            value={editor.amount}
                            onChange={value => setEditor({ ...editor, amount: value })}
                            min={0.01}
                            decimalScale={2}
                        />
                        {preview && (
                            <Paper withBorder radius="md" p="sm">
                                <Text size="xs" c="dimmed" mb={6}>
                                    Planned nutrition preview
                                </Text>
                                <SimpleGrid cols={4}>
                                    <Text size="sm">
                                        <strong>{Math.round(preview.calories ?? 0)}</strong>
                                        <br />
                                        <small>kcal</small>
                                    </Text>
                                    <Text size="sm">
                                        <strong>{Math.round(preview.protein ?? 0)} g</strong>
                                        <br />
                                        <small>protein</small>
                                    </Text>
                                    <Text size="sm">
                                        <strong>{Math.round(preview.carbs ?? 0)} g</strong>
                                        <br />
                                        <small>carbs</small>
                                    </Text>
                                    <Text size="sm">
                                        <strong>{Math.round(preview.fat ?? 0)} g</strong>
                                        <br />
                                        <small>fat</small>
                                    </Text>
                                </SimpleGrid>
                            </Paper>
                        )}
                        <Divider />
                        <Group justify="flex-end">
                            <Button
                                variant="default"
                                onClick={() => setEditor(null)}
                                disabled={busy}
                            >
                                Cancel
                            </Button>
                            <Button
                                color="trackit"
                                loading={busy}
                                disabled={
                                    !editor.selection || !editor.date || Number(editor.amount) <= 0
                                }
                                onClick={() => void saveEditor()}
                            >
                                {editor.item ? 'Save changes' : 'Add to plan'}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <Modal
                opened={Boolean(logState)}
                onClose={() => !busy && setLogState(null)}
                title={<Text fw={700}>Log as eaten</Text>}
            >
                {logState && (
                    <Stack>
                        <div>
                            <Text fw={700}>{logState.item.meal.reference.name}</Text>
                            <Text size="sm" c="dimmed">
                                Planned for {logState.item.meal.mealType.toLowerCase()}. Adjust what
                                actually happened before logging.
                            </Text>
                        </div>
                        <NumberInput
                            label={logState.item.meal.unit === 'g' ? 'Amount' : 'Servings'}
                            suffix={logState.item.meal.unit === 'g' ? ' g' : undefined}
                            value={logState.amount}
                            onChange={value => setLogState({ ...logState, amount: value })}
                            min={0.01}
                            decimalScale={2}
                        />
                        <TextInput
                            type="datetime-local"
                            label="Date and time"
                            description={`Interpreted in ${timezone}.`}
                            value={logState.recordedAt}
                            onChange={event =>
                                setLogState({ ...logState, recordedAt: event.currentTarget.value })
                            }
                        />
                        <Group justify="flex-end">
                            <Button
                                variant="default"
                                onClick={() => setLogState(null)}
                                disabled={busy}
                            >
                                Cancel
                            </Button>
                            <Button color="trackit" loading={busy} onClick={() => void saveLog()}>
                                Log as eaten
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </div>
    )
}
