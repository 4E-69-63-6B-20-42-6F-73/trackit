import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    ActionIcon,
    Alert,
    Badge,
    Box,
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

const mealTypes: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

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

export function Plan() {
    const [params, setParams] = useSearchParams()
    const compact = useMediaQuery('(max-width: 62em)')
    const { preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const locale = preferences?.locale
    const todayKey = calendarTodayKey(timezone)
    const routeDate = params.get('date') ?? todayKey
    const weekStart = weekStartKey(routeDate)
    const dates = useMemo(() => weekDateKeys(weekStart), [weekStart])
    const selectedDate = dates.includes(routeDate) ? routeDate : dates[0]
    const [items, setItems] = useState<MealPlanItem[]>([])
    const [foods, setFoods] = useState<Food[]>([])
    const [recipes, setRecipes] = useState<RecipeRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState('')
    const [editor, setEditor] = useState<EditorState | null>(null)
    const [logState, setLogState] = useState<LogState | null>(null)
    const [busy, setBusy] = useState(false)

    const refresh = useCallback(
        () =>
            Promise.all([
                listPlanItems({ from: dates[0], to: dates[6] }),
                searchFoods(''),
                listRecipes(),
            ])
                .then(([nextItems, nextFoods, nextRecipes]) => {
                    setItems(nextItems)
                    setFoods(nextFoods)
                    setRecipes(nextRecipes)
                    setMessage('')
                })
                .catch(() => setMessage('Your meal plan could not be loaded from the server.'))
                .finally(() => setLoading(false)),
        [dates],
    )

    useEffect(() => {
        void refresh()
    }, [refresh])

    const navigateDate = (date: string) => {
        setLoading(true)
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
    const preview = useMemo(() => {
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
    }, [editor?.amount, selectedFood, selectedRecipe])

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

    const dayCard = (date: string) => {
        const dayItems = items.filter(item => item.scheduledDate === date)
        const isToday = date === todayKey
        return (
            <Paper
                key={date}
                withBorder
                radius="lg"
                p="md"
                style={isToday ? { borderColor: 'var(--teal)' } : undefined}
            >
                <Group justify="space-between" align="flex-start" mb="md">
                    <div>
                        <Text size="xs" fw={700} c={isToday ? 'teal' : 'dimmed'}>
                            {isToday
                                ? 'TODAY'
                                : formatCalendarDate(date, locale, {
                                      weekday: 'short',
                                  }).toUpperCase()}
                        </Text>
                        <Text fw={700} size="lg">
                            {formatCalendarDate(date, locale, {
                                month: 'short',
                                day: 'numeric',
                            })}
                        </Text>
                    </div>
                    <Badge variant="light" color={dayItems.length ? 'teal' : 'gray'} size="sm">
                        {dayItems.length} {dayItems.length === 1 ? 'item' : 'items'}
                    </Badge>
                </Group>
                <Stack gap="md">
                    {mealTypes.map(mealType => {
                        const slotItems = dayItems.filter(item => item.meal.mealType === mealType)
                        return (
                            <Box key={mealType}>
                                <Group justify="space-between" mb={6}>
                                    <Text size="xs" fw={700} c="dimmed">
                                        {mealType.toUpperCase()}
                                    </Text>
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        size="sm"
                                        aria-label={`Add ${mealType.toLowerCase()}`}
                                        onClick={() => openNew(date, mealType)}
                                    >
                                        <IconPlus size={15} />
                                    </ActionIcon>
                                </Group>
                                <Stack gap={6}>
                                    {slotItems.map(item => {
                                        const status = planStatus(item)
                                        return (
                                            <Paper
                                                key={item.id}
                                                withBorder
                                                radius="md"
                                                p="sm"
                                                bg={
                                                    status === 'skipped'
                                                        ? 'var(--mantine-color-gray-0)'
                                                        : undefined
                                                }
                                            >
                                                <Group
                                                    justify="space-between"
                                                    align="flex-start"
                                                    wrap="nowrap"
                                                >
                                                    <Box style={{ minWidth: 0 }}>
                                                        <Group gap={6} wrap="nowrap">
                                                            <Text fw={650} size="sm" lineClamp={1}>
                                                                {item.meal.reference.name}
                                                            </Text>
                                                            {status !== 'planned' && (
                                                                <Badge
                                                                    size="xs"
                                                                    variant="light"
                                                                    color={
                                                                        status === 'logged'
                                                                            ? 'teal'
                                                                            : 'gray'
                                                                    }
                                                                >
                                                                    {status === 'logged'
                                                                        ? 'Logged'
                                                                        : 'Skipped'}
                                                                </Badge>
                                                            )}
                                                        </Group>
                                                        <Text size="xs" c="dimmed">
                                                            {formatPlanAmount(item)} ·{' '}
                                                            {item.meal.reference.type === 'recipe'
                                                                ? 'Recipe'
                                                                : 'Food'}
                                                        </Text>
                                                    </Box>
                                                    <Menu position="bottom-end" shadow="md">
                                                        <Menu.Target>
                                                            <ActionIcon
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
                                                                    leftSection={
                                                                        <IconCheck size={15} />
                                                                    }
                                                                    onClick={() => openLog(item)}
                                                                >
                                                                    Log as eaten
                                                                </Menu.Item>
                                                            )}
                                                            {status !== 'logged' && (
                                                                <Menu.Item
                                                                    leftSection={
                                                                        <IconEdit size={15} />
                                                                    }
                                                                    onClick={() => openEdit(item)}
                                                                >
                                                                    Edit or move
                                                                </Menu.Item>
                                                            )}
                                                            {status === 'planned' && (
                                                                <Menu.Item
                                                                    leftSection={
                                                                        <IconX size={15} />
                                                                    }
                                                                    onClick={() =>
                                                                        void mutate(() =>
                                                                            setPlanMealSkipped(
                                                                                item,
                                                                                true,
                                                                            ),
                                                                        )
                                                                    }
                                                                >
                                                                    Skip
                                                                </Menu.Item>
                                                            )}
                                                            {status === 'skipped' && (
                                                                <Menu.Item
                                                                    leftSection={
                                                                        <IconRestore size={15} />
                                                                    }
                                                                    onClick={() =>
                                                                        void mutate(() =>
                                                                            setPlanMealSkipped(
                                                                                item,
                                                                                false,
                                                                            ),
                                                                        )
                                                                    }
                                                                >
                                                                    Restore
                                                                </Menu.Item>
                                                            )}
                                                            <Menu.Divider />
                                                            <Menu.Item
                                                                color="red"
                                                                leftSection={
                                                                    <IconTrash size={15} />
                                                                }
                                                                onClick={() =>
                                                                    void mutate(() =>
                                                                        deletePlanMeal(item),
                                                                    )
                                                                }
                                                            >
                                                                Remove from plan
                                                            </Menu.Item>
                                                        </Menu.Dropdown>
                                                    </Menu>
                                                </Group>
                                            </Paper>
                                        )
                                    })}
                                    {slotItems.length === 0 && (
                                        <Button
                                            variant="subtle"
                                            color="gray"
                                            size="compact-xs"
                                            leftSection={<IconPlus size={14} />}
                                            onClick={() => openNew(date, mealType)}
                                            style={{ alignSelf: 'flex-start' }}
                                        >
                                            Add {mealType.toLowerCase()}
                                        </Button>
                                    )}
                                </Stack>
                            </Box>
                        )
                    })}
                </Stack>
            </Paper>
        )
    }

    return (
        <div className="page-content simple-page">
            <PageHeader
                title="Plan"
                description="Shape the week before it becomes part of your health record. Planned meals only affect nutrition after you log them as eaten."
            />

            <Group justify="space-between" mt="md" mb="md" align="center">
                <Group gap="xs">
                    <ActionIcon
                        variant="default"
                        aria-label="Previous week"
                        onClick={() => navigateDate(addPlanDays(weekStart, -7))}
                    >
                        <IconChevronLeft size={17} />
                    </ActionIcon>
                    <div>
                        <Text fw={700}>{weekLabel}</Text>
                        <Text size="xs" c="dimmed">
                            Meals are intentions until they are logged.
                        </Text>
                    </div>
                    <ActionIcon
                        variant="default"
                        aria-label="Next week"
                        onClick={() => navigateDate(addPlanDays(weekStart, 7))}
                    >
                        <IconChevronRight size={17} />
                    </ActionIcon>
                </Group>
                {weekStart !== weekStartKey(todayKey) && (
                    <Button variant="default" size="sm" onClick={() => navigateDate(todayKey)}>
                        This week
                    </Button>
                )}
            </Group>

            {message && (
                <Alert color="orange" mb="md">
                    {message}
                </Alert>
            )}

            {compact && (
                <Box style={{ overflowX: 'auto' }} mb="md">
                    <Group gap="xs" wrap="nowrap">
                        {dates.map(date => (
                            <Button
                                key={date}
                                variant={selectedDate === date ? 'filled' : 'default'}
                                color={selectedDate === date ? 'trackit' : 'gray'}
                                size="sm"
                                onClick={() => navigateDate(date)}
                                style={{ flex: '0 0 auto' }}
                            >
                                <Stack gap={0} align="center">
                                    <Text size="xs">
                                        {formatCalendarDate(date, locale, {
                                            weekday: 'short',
                                        })}
                                    </Text>
                                    <Text fw={700} size="sm">
                                        {formatCalendarDate(date, locale, {
                                            day: 'numeric',
                                        })}
                                    </Text>
                                </Stack>
                            </Button>
                        ))}
                    </Group>
                </Box>
            )}

            {loading ? (
                <SimpleGrid cols={{ base: 1, md: 3, xl: 7 }} spacing="sm">
                    {Array.from({ length: compact ? 1 : 7 }, (_, index) => (
                        <Skeleton key={index} height={440} radius="lg" />
                    ))}
                </SimpleGrid>
            ) : compact ? (
                dayCard(selectedDate)
            ) : (
                <SimpleGrid cols={{ base: 1, md: 3, xl: 7 }} spacing="sm" align="start">
                    {dates.map(dayCard)}
                </SimpleGrid>
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
