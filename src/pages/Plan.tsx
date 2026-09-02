import { useState } from 'react'
import {
    Alert,
    Button,
    Chip,
    Divider,
    Group,
    Modal,
    NumberInput,
    Paper,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import {
    calendarLocalDateTimeToInstant,
    calendarLocalDateTimeValue,
    calendarTodayKey,
    formatCalendarDate,
} from '@trackit/domain/calendar'
import { nutrientsFor, roundedNutrients, type Nutrients } from '@trackit/domain/nutrition'
import {
    addPlanDays,
    formatPlanProgress,
    type MealPlanItem,
    type MealType,
    type PlanReferenceType,
    weekDateKeys,
    weekStartKey,
} from '@trackit/domain/planning'
import { useServerData } from '../hooks/useServerData'
import { listFoodCategories } from '../lib/foodCategoryApi'
import { listRecipes, searchFoods } from '../lib/nutritionApi'
import {
    createPlanMeal,
    createPlanSchedule,
    deletePlanMeal,
    listPlanItems,
    listPlanSchedules,
    logPlannedMeal,
    setPlanMealSkipped,
    stopPlanSchedule,
    updatePlanMeal,
    type PlanSchedule,
} from '../lib/planApi'
import { serverQueryKeys } from '../lib/serverQueries'
import { PlanBoardView } from './PlanBoardView'
import '../plan.css'

const mealTypes: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

const weekdayOptions = [
    { value: '1', label: 'Mon' },
    { value: '2', label: 'Tue' },
    { value: '3', label: 'Wed' },
    { value: '4', label: 'Thu' },
    { value: '5', label: 'Fri' },
    { value: '6', label: 'Sat' },
    { value: '0', label: 'Sun' },
]

type RepeatMode = 'none' | 'weekly'

type EditorState = {
    item: MealPlanItem | null
    date: string
    time: string
    mealType: MealType
    selection: string | null
    amount: number | string
    repeat: RepeatMode
    weekdays: string[]
}

type LogState = {
    item: MealPlanItem
    recordedAt: string
    amount: number | string
    foodId: string | null
}

const referenceValue = (item: MealPlanItem) =>
    `${item.meal.reference.type}:${item.meal.reference.id}`

const weekdayForDate = (dateKey: string) => new Date(`${dateKey}T12:00:00.000Z`).getUTCDay()

const scheduleDaysLabel = (weekdays: number[]) =>
    weekdayOptions
        .filter(option => weekdays.includes(Number(option.value)))
        .map(option => option.label)
        .join(', ')

const nextScheduleDate = (startDate: string, weekdays: number[]) => {
    for (let offset = 0; offset < 7; offset += 1) {
        const date = addPlanDays(startDate, offset)
        if (weekdays.includes(weekdayForDate(date))) return date
    }
    return startDate
}

const formatScheduleAmount = (schedule: PlanSchedule) =>
    schedule.meal.unit === 'g'
        ? `${Math.round(schedule.meal.amount * 10) / 10} g`
        : `${Math.round(schedule.meal.amount * 100) / 100} ${schedule.meal.amount === 1 ? 'serving' : 'servings'}`

export function Plan() {
    const [params, setParams] = useSearchParams()
    const compact = useMediaQuery('(max-width: 62em)') ?? false
    const { preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const locale = preferences?.locale
    const todayKey = calendarTodayKey(timezone)
    const routeDate = params.get('date') ?? todayKey
    const weekStart = weekStartKey(routeDate)
    const dates = weekDateKeys(weekStart)
    const selectedDate = dates.includes(routeDate) ? routeDate : dates[0]
    const planRange = { from: dates[0], to: dates[6] }
    const itemsQuery = useQuery({
        queryKey: [...serverQueryKeys.planItems, planRange],
        queryFn: ({ signal }) => listPlanItems(planRange, signal),
    })
    const foodsQuery = useQuery({
        queryKey: [...serverQueryKeys.foods, ''],
        queryFn: () => searchFoods(''),
    })
    const recipesQuery = useQuery({
        queryKey: serverQueryKeys.recipes,
        queryFn: () => listRecipes(),
    })
    const categoriesQuery = useQuery({
        queryKey: serverQueryKeys.foodCategories,
        queryFn: ({ signal }) => listFoodCategories(signal),
    })
    const schedulesQuery = useQuery({
        queryKey: serverQueryKeys.planSchedules,
        queryFn: ({ signal }) => listPlanSchedules(signal),
    })
    const items = itemsQuery.data ?? []
    const foods = foodsQuery.data ?? []
    const recipes = recipesQuery.data ?? []
    const categories = categoriesQuery.data ?? []
    const schedules = schedulesQuery.data ?? []
    const loading =
        itemsQuery.isPending ||
        foodsQuery.isPending ||
        recipesQuery.isPending ||
        categoriesQuery.isPending ||
        schedulesQuery.isPending
    const loadError =
        itemsQuery.isError ||
        foodsQuery.isError ||
        recipesQuery.isError ||
        categoriesQuery.isError ||
        schedulesQuery.isError
            ? 'Your meal plan could not be loaded from the server.'
            : ''
    const [editor, setEditor] = useState<EditorState | null>(null)
    const [logState, setLogState] = useState<LogState | null>(null)
    const [schedulesOpen, setSchedulesOpen] = useState(false)

    const navigateDate = (date: string) => {
        const next = new URLSearchParams(params)
        if (date === todayKey) next.delete('date')
        else next.set('date', date)
        setParams(next, { replace: true })
    }

    const openNew = (date: string, mealType: MealType) =>
        setEditor({
            item: null,
            date,
            time: '',
            mealType,
            selection: null,
            amount: 1,
            repeat: 'none',
            weekdays: [String(weekdayForDate(date))],
        })

    const openEdit = (item: MealPlanItem) =>
        setEditor({
            item,
            date: item.scheduledDate,
            time: item.scheduledTime ?? '',
            mealType: item.meal.mealType,
            selection: referenceValue(item),
            amount: item.meal.amount,
            repeat: 'none',
            weekdays: [],
        })

    const selection = editor?.selection
    const selectedFood = selection?.startsWith('food:')
        ? foods.find(food => food.id === selection.slice(5))
        : undefined
    const selectedRecipe = selection?.startsWith('recipe:')
        ? recipes.find(recipe => recipe.id === selection.slice(7))
        : undefined
    const selectedCategory = selection?.startsWith('category:')
        ? categories.find(category => category.id === selection.slice(9))
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
            amount: value.startsWith('category:') ? 200 : (food?.servingGrams ?? 1),
        })
    }

    const editorMutation = useMutation({
        mutationFn: async (current: EditorState) => {
            if (!current.selection) return null
            const amount = Number(current.amount)
            if (!Number.isFinite(amount) || amount <= 0) return null
            const [type, id] = current.selection.split(':') as [PlanReferenceType, string]
            const weekdays = current.weekdays.map(Number)
            if (!current.item && current.repeat === 'weekly' && weekdays.length === 0) return null
            const changes = {
                scheduledDate: current.date,
                scheduledTime: current.time || null,
                mealType: current.mealType,
                reference: { type, id },
                amount,
            }
            if (current.item) {
                await updatePlanMeal(current.item, changes)
                return null
            }
            if (current.repeat === 'weekly') {
                await createPlanSchedule({
                    startDate: current.date,
                    scheduledTime: current.time || null,
                    mealType: current.mealType,
                    reference: { type, id },
                    amount,
                    weekdays,
                })
                return nextScheduleDate(current.date, weekdays)
            }
            await createPlanMeal(changes)
            return null
        },
        onSuccess: destinationDate => {
            setEditor(null)
            if (destinationDate && weekStartKey(destinationDate) !== weekStart)
                navigateDate(destinationDate)
        },
    })

    const actionMutation = useMutation({
        mutationFn: (action: () => Promise<unknown>) => action(),
    })

    const categoryFoods = (item: MealPlanItem) => {
        if (item.meal.reference.type !== 'category') return []
        const category = categories.find(candidate => candidate.id === item.meal.reference.id)
        if (!category) return []
        const members = new Set(category.foodIds)
        return foods.filter(food => members.has(food.id))
    }

    const openLog = (item: MealPlanItem) => {
        const now = calendarLocalDateTimeValue(new Date(), timezone)
        const [, currentTime] = now.split('T')
        const plannedTime =
            item.scheduledTime ?? (item.scheduledDate === todayKey ? currentTime : '12:00')
        const remaining = Math.max(0.01, item.meal.amount - item.meal.fulfilledAmount)
        setLogState({
            item,
            recordedAt: `${item.scheduledDate}T${plannedTime}`,
            amount: item.meal.reference.type === 'category' ? remaining : item.meal.amount,
            foodId: null,
        })
    }

    const logMutation = useMutation({
        mutationFn: async (current: LogState) => {
            const amount = Number(current.amount)
            if (!Number.isFinite(amount) || amount <= 0 || !current.recordedAt) return
            if (current.item.meal.reference.type === 'category' && !current.foodId) return
            await logPlannedMeal(current.item, {
                eatenAt: calendarLocalDateTimeToInstant(current.recordedAt, timezone).toISOString(),
                amount,
                foodId: current.foodId ?? undefined,
            })
        },
        onSuccess: () => setLogState(null),
    })
    const busy = editorMutation.isPending || actionMutation.isPending || logMutation.isPending
    const latestMutation = [
        { result: editorMutation, fallback: 'Could not save this planned meal.' },
        { result: actionMutation, fallback: 'Your plan could not be updated.' },
        { result: logMutation, fallback: 'Could not log this planned meal.' },
    ].reduce((latest, current) =>
        current.result.submittedAt > latest.result.submittedAt ? current : latest,
    )
    const mutationError = latestMutation.result.isError
        ? latestMutation.result.error instanceof Error
            ? latestMutation.result.error.message
            : latestMutation.fallback
        : ''
    const weekLabel = `${formatCalendarDate(dates[0], locale, { month: 'short', day: 'numeric' })} – ${formatCalendarDate(dates[6], locale, { month: 'short', day: 'numeric', year: 'numeric' })}`
    const logFoods = logState ? categoryFoods(logState.item) : []

    return (
        <div className="page-content simple-page">
            <PageHeader
                title="Plan"
                description="Plan meals ahead. They become part of your health record only when logged."
            />

            {(mutationError || loadError) && (
                <Alert color="orange" mb="md">
                    {mutationError || loadError}
                </Alert>
            )}

            <PlanBoardView
                compact={compact}
                loading={loading}
                dates={dates}
                todayKey={todayKey}
                selectedDate={selectedDate}
                weekStart={weekStart}
                weekLabel={weekLabel}
                locale={locale}
                items={items}
                schedulesCount={schedules.length}
                onNavigateDate={navigateDate}
                onOpenSchedules={() => setSchedulesOpen(true)}
                onAdd={openNew}
                onEdit={openEdit}
                onLog={openLog}
                onSkip={item => actionMutation.mutate(() => setPlanMealSkipped(item, true))}
                onRestore={item => actionMutation.mutate(() => setPlanMealSkipped(item, false))}
                onDelete={item => actionMutation.mutate(() => deletePlanMeal(item))}
            />

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
                        <SimpleGrid cols={{ base: 1, sm: 3 }}>
                            <TextInput
                                type="date"
                                label="Day"
                                value={editor.date}
                                onChange={event =>
                                    setEditor({ ...editor, date: event.currentTarget.value })
                                }
                            />
                            <TextInput
                                type="time"
                                label="Time (optional)"
                                value={editor.time}
                                onChange={event =>
                                    setEditor({ ...editor, time: event.currentTarget.value })
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
                        {!editor.item && (
                            <Stack gap="xs">
                                <Select
                                    label="Repeat"
                                    value={editor.repeat}
                                    onChange={value =>
                                        setEditor({
                                            ...editor,
                                            repeat: (value ?? 'none') as RepeatMode,
                                        })
                                    }
                                    data={[
                                        { value: 'none', label: 'Does not repeat' },
                                        { value: 'weekly', label: 'Every week' },
                                    ]}
                                />
                                {editor.repeat === 'weekly' && (
                                    <div>
                                        <Text size="sm" fw={600} mb={6}>
                                            Repeat on
                                        </Text>
                                        <Chip.Group
                                            multiple
                                            value={editor.weekdays}
                                            onChange={weekdays =>
                                                setEditor({ ...editor, weekdays })
                                            }
                                        >
                                            <Group gap={6} wrap="wrap">
                                                {weekdayOptions.map(day => (
                                                    <Chip
                                                        key={day.value}
                                                        value={day.value}
                                                        size="xs"
                                                    >
                                                        {day.label}
                                                    </Chip>
                                                ))}
                                            </Group>
                                        </Chip.Group>
                                        <Text size="xs" c="dimmed" mt={7}>
                                            {editor.weekdays.length
                                                ? `Repeats every ${scheduleDaysLabel(editor.weekdays.map(Number))}, starting ${formatCalendarDate(editor.date, locale, { month: 'short', day: 'numeric', year: 'numeric' })}.`
                                                : 'Choose at least one day.'}
                                        </Text>
                                    </div>
                                )}
                            </Stack>
                        )}
                        <Select
                            searchable
                            label="Food, recipe, or food group"
                            placeholder="Search your library or choose a flexible group"
                            value={editor.selection}
                            onChange={chooseReference}
                            data={[
                                ...categories.map(category => ({
                                    value: `category:${category.id}`,
                                    label: `Food group · ${category.name}`,
                                })),
                                ...recipes.map(recipe => ({
                                    value: `recipe:${recipe.id}`,
                                    label: `Recipe · ${recipe.name}`,
                                })),
                                ...foods.map(food => ({
                                    value: `food:${food.id}`,
                                    label: `Food · ${food.name}`,
                                })),
                            ]}
                            nothingFoundMessage="No saved food, recipe, or food group found"
                        />
                        <NumberInput
                            label={selectedRecipe ? 'Servings' : 'Amount'}
                            suffix={selectedRecipe ? undefined : ' g'}
                            value={editor.amount}
                            onChange={value => setEditor({ ...editor, amount: value })}
                            min={0.01}
                            decimalScale={2}
                        />
                        {selectedCategory && (
                            <Text size="sm" c="dimmed">
                                Any saved food assigned to {selectedCategory.name} can count toward
                                this target. Progress can be logged in multiple entries.
                            </Text>
                        )}
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
                                loading={editorMutation.isPending}
                                disabled={
                                    !editor.selection ||
                                    !editor.date ||
                                    Number(editor.amount) <= 0 ||
                                    (editor.repeat === 'weekly' && editor.weekdays.length === 0)
                                }
                                onClick={() => editorMutation.mutate(editor)}
                            >
                                {editor.item
                                    ? 'Save changes'
                                    : editor.repeat === 'weekly'
                                      ? 'Create schedule'
                                      : 'Add to plan'}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <Modal
                opened={schedulesOpen}
                onClose={() => !busy && setSchedulesOpen(false)}
                title={<Text fw={700}>Recurring schedules</Text>}
                size="lg"
            >
                {schedules.length ? (
                    <Stack>
                        {schedules.map(schedule => (
                            <Paper key={schedule.id} withBorder radius="md" p="md">
                                <Group justify="space-between" align="flex-start" wrap="nowrap">
                                    <div>
                                        <Text fw={700}>{schedule.meal.reference.name}</Text>
                                        <Text size="sm" c="dimmed">
                                            {formatScheduleAmount(schedule)} ·{' '}
                                            {schedule.meal.mealType}
                                        </Text>
                                        <Text size="sm" c="dimmed" mt={4}>
                                            Every {scheduleDaysLabel(schedule.weekdays)}
                                            {schedule.scheduledTime
                                                ? ` · ${schedule.scheduledTime}`
                                                : ''}
                                            {' · Starts '}
                                            {formatCalendarDate(schedule.startDate, locale, {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </Text>
                                    </div>
                                    <Button
                                        variant="subtle"
                                        color="red"
                                        size="xs"
                                        loading={actionMutation.isPending}
                                        onClick={() =>
                                            actionMutation.mutate(() =>
                                                stopPlanSchedule(schedule, todayKey),
                                            )
                                        }
                                    >
                                        Stop repeating
                                    </Button>
                                </Group>
                            </Paper>
                        ))}
                    </Stack>
                ) : (
                    <Text size="sm" c="dimmed">
                        No recurring meal schedules yet. Add a planned meal and choose Every week to
                        create one.
                    </Text>
                )}
            </Modal>

            <Modal
                opened={Boolean(logState)}
                onClose={() => !busy && setLogState(null)}
                title={
                    <Text fw={700}>
                        {logState?.item.meal.reference.type === 'category'
                            ? 'Log progress'
                            : 'Log as eaten'}
                    </Text>
                }
            >
                {logState && (
                    <Stack>
                        <div>
                            <Text fw={700}>{logState.item.meal.reference.name}</Text>
                            <Text size="sm" c="dimmed">
                                {logState.item.meal.reference.type === 'category'
                                    ? `${formatPlanProgress(logState.item)} logged. Choose what you ate.`
                                    : `Planned for ${logState.item.meal.mealType.toLowerCase()}. Adjust what actually happened before logging.`}
                            </Text>
                        </div>
                        {logState.item.meal.reference.type === 'category' && (
                            <Select
                                searchable
                                required
                                label="Food"
                                placeholder={
                                    logFoods.length
                                        ? `Choose a ${logState.item.meal.reference.name.toLowerCase()} food`
                                        : 'Assign foods to this group in Library first'
                                }
                                value={logState.foodId}
                                onChange={foodId => setLogState({ ...logState, foodId })}
                                data={logFoods.map(food => ({ value: food.id, label: food.name }))}
                                nothingFoundMessage="No matching foods in your library"
                            />
                        )}
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
                            <Button
                                color="trackit"
                                loading={logMutation.isPending}
                                disabled={
                                    logState.item.meal.reference.type === 'category' &&
                                    !logState.foodId
                                }
                                onClick={() => logMutation.mutate(logState)}
                            >
                                {logState.item.meal.reference.type === 'category'
                                    ? 'Log progress'
                                    : 'Log as eaten'}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </div>
    )
}
