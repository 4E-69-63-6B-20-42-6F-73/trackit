import { useEffect, useMemo, useRef, useState } from 'react'
import {
    ActionIcon,
    Alert,
    Button,
    Group,
    Loader,
    Modal,
    NumberInput,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import {
    IconBarcode,
    IconCamera,
    IconCheck,
    IconPlus,
    IconSearch,
    IconStar,
} from '@tabler/icons-react'
import {
    calendarLocalDateTimeToInstant,
    calendarLocalDateTimeValue,
    calendarTodayKey,
    formatCalendarDate,
} from '@trackit/domain/calendar'
import {
    nutrientsFor,
    roundedNutrients,
    type Food,
    type Nutrients,
} from '@trackit/domain/nutrition'
import { useServerData } from '../../hooks/useServerData'
import {
    createFood,
    listRecipes,
    logMeal,
    lookupCatalogBarcode,
    searchFoodCatalog,
    searchFoods,
    updateFood,
    updateMeal,
    type MealRecord,
    type RecipeRecord,
} from '../../lib/nutritionApi'
import { setRecipeFavorite } from '../../lib/recipeFavoriteApi'
import { NewFoodModal } from '../NewFoodModal'

type Selection =
    | { kind: 'food'; food: Food }
    | { kind: 'recipe'; recipe: RecipeRecord }
    | { kind: 'snapshot'; meal: MealRecord }
type CatalogFood = Omit<Food, 'id' | 'version'>

const selectionKey = (selection: Selection) =>
    selection.kind === 'food'
        ? `food:${selection.food.id}`
        : selection.kind === 'recipe'
          ? `recipe:${selection.recipe.id}`
          : `snapshot:${selection.meal.id}`

const selectionName = (selection: Selection) =>
    selection.kind === 'food'
        ? selection.food.name
        : selection.kind === 'recipe'
          ? selection.recipe.name
          : selection.meal.name

const selectionFavorite = (selection: Selection) =>
    selection.kind === 'food'
        ? selection.food.favorite
        : selection.kind === 'recipe'
          ? selection.recipe.favorite
          : false

const selectionDefaultAmount = (selection: Selection) =>
    selection.kind === 'food'
        ? selection.food.servingGrams
        : selection.kind === 'recipe'
          ? 1
          : (selection.meal.serving?.amount ?? 1)

const selectionQuality = (selection: Selection) =>
    selection.kind === 'food'
        ? selection.food.nutritionQuality
        : selection.kind === 'recipe'
          ? selection.recipe.nutritionQuality
          : selection.meal.nutritionQuality

const selectionNutrients = (selection: Selection, amount: number) => {
    if (selection.kind === 'food') return roundedNutrients(nutrientsFor(selection.food, amount))
    if (selection.kind === 'recipe')
        return roundedNutrients(
            Object.fromEntries(
                Object.entries(selection.recipe.nutrientsPerServing).map(([key, value]) => [
                    key,
                    value * amount,
                ]),
            ) as Nutrients,
        )
    const factor = amount / (selection.meal.serving?.amount ?? 1)
    return roundedNutrients(
        Object.fromEntries(
            Object.entries(selection.meal.nutrientSnapshot)
                .filter(
                    (entry): entry is [string, number] =>
                        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
                )
                .map(([key, value]) => [key, value * factor]),
        ) as Partial<Nutrients>,
    )
}

const catalogNutrients = (food: CatalogFood, amount: number): Partial<Nutrients> => {
    const factor = amount / 100
    return Object.fromEntries(
        Object.entries(food.per100g)
            .filter(
                (entry): entry is [string, number] =>
                    typeof entry[1] === 'number' && Number.isFinite(entry[1]),
            )
            .map(([key, value]) => [key, value * factor]),
    ) as Partial<Nutrients>
}

const foodUpdatePayload = (food: Food): Omit<Food, 'id' | 'version'> => {
    const payload = { ...food }
    delete (payload as Partial<Food>).id
    delete (payload as Partial<Food>).version
    return payload as Omit<Food, 'id' | 'version'>
}

const resultSummary = (selection: Selection) => {
    const nutrients = selectionNutrients(selection, selectionDefaultAmount(selection))
    return {
        calories: Math.round(nutrients.calories ?? 0),
        protein: Math.round((nutrients.protein ?? 0) * 10) / 10,
    }
}

const selectionMeta = (selection: Selection) =>
    selection.kind === 'food'
        ? selection.food.brand || `${selection.food.servingGrams} g serving`
        : selection.kind === 'recipe'
          ? 'Recipe · per serving'
          : selection.meal.serving
            ? `Current entry · ${selection.meal.serving.amount} ${selection.meal.serving.unit === 'g' ? 'g' : selection.meal.serving.amount === 1 ? 'serving' : 'servings'}`
            : 'Current journal entry'

const defaultServingLabel = (food: Food) => {
    const label = food.servingName.trim()
    return /^[\d¼½¾]/.test(label) ? label : `1 ${label}`
}

export function FoodLogger({
    opened,
    close,
    selectedDate,
    onFeedback,
    editMeal,
    onSaved,
}: {
    opened: boolean
    close: () => void
    selectedDate?: string | null
    onFeedback?: (message: string) => void
    editMeal?: MealRecord
    onSaved?: () => void
}) {
    const { preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const locale = preferences?.locale
    const nowValue = calendarLocalDateTimeValue(new Date(), timezone)
    const [nowDay, nowTime] = nowValue.split('T')
    const targetDate = editMeal
        ? calendarLocalDateTimeValue(new Date(editMeal.eatenAt), timezone).split('T')[0]
        : (selectedDate ?? calendarTodayKey(timezone))
    const [recordedAt, setRecordedAt] = useState(
        editMeal
            ? calendarLocalDateTimeValue(new Date(editMeal.eatenAt), timezone)
            : `${targetDate}T${selectedDate && selectedDate !== nowDay ? '12:00' : nowTime}`,
    )
    const hour = Number(nowTime.slice(0, 2))
    const [mealType, setMealType] = useState(
        editMeal?.mealType ??
            (hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : hour < 21 ? 'Dinner' : 'Snack'),
    )
    const [query, setQuery] = useState('')
    const [libraryFoods, setLibraryFoods] = useState<Food[]>([])
    const [foodResults, setFoodResults] = useState<Food[]>([])
    const [recipes, setRecipes] = useState<RecipeRecord[]>([])
    const [selection, setSelection] = useState<Selection | null>(
        editMeal ? { kind: 'snapshot', meal: editMeal } : null,
    )
    const [amount, setAmount] = useState<number | string>(
        editMeal?.serving?.amount ?? (editMeal ? 1 : 100),
    )
    const [detailsOpen, setDetailsOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [loadingLibrary, setLoadingLibrary] = useState(true)
    const [searching, setSearching] = useState(false)
    const [loggingKey, setLoggingKey] = useState<string | null>(null)
    const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [catalogMode, setCatalogMode] = useState<'search' | 'barcode' | null>(null)
    const [catalogResults, setCatalogResults] = useState<CatalogFood[]>([])
    const [catalogBusy, setCatalogBusy] = useState(false)
    const [catalogError, setCatalogError] = useState('')
    const [barcode, setBarcode] = useState('')
    const searchRef = useRef<HTMLInputElement>(null)
    const cameraInput = useRef<HTMLInputElement>(null)
    const isHistorical = targetDate !== calendarTodayKey(timezone)
    const [recordedDate, recordedTime] = recordedAt.split('T')

    useEffect(() => {
        if (!opened) return
        let active = true
        void Promise.all([searchFoods(''), listRecipes()])
            .then(([foods, nextRecipes]) => {
                if (!active) return
                setLibraryFoods(foods)
                setRecipes(nextRecipes)
                setError('')
            })
            .catch(() => active && setError('Your food library could not be loaded.'))
            .finally(() => active && setLoadingLibrary(false))
        return () => {
            active = false
        }
    }, [opened])

    useEffect(() => {
        if (!opened) return
        const value = query.trim()
        if (!value) return
        let active = true
        const timer = window.setTimeout(() => {
            setSearching(true)
            void searchFoods(value)
                .then(foods => active && setFoodResults(foods))
                .catch(() => active && setError('Food search is temporarily unavailable.'))
                .finally(() => active && setSearching(false))
        }, 220)
        return () => {
            active = false
            window.clearTimeout(timer)
        }
    }, [opened, query])

    const queryValue = query.trim().toLowerCase()
    const recipeResults = useMemo(
        () =>
            queryValue
                ? recipes.filter(recipe => recipe.name.toLowerCase().includes(queryValue))
                : [],
        [queryValue, recipes],
    )
    const localResults: Selection[] = [
        ...foodResults.map(food => ({ kind: 'food' as const, food })),
        ...recipeResults.map(recipe => ({ kind: 'recipe' as const, recipe })),
    ]
    const favorites: Selection[] = [
        ...libraryFoods
            .filter(food => food.favorite)
            .map(food => ({ kind: 'food' as const, food })),
        ...recipes
            .filter(recipe => recipe.favorite)
            .map(recipe => ({ kind: 'recipe' as const, recipe })),
    ]
    const recent: Selection[] = libraryFoods
        .filter(food => !food.favorite)
        .slice(0, 6)
        .map(food => ({ kind: 'food' as const, food }))
    const nutrients = selection ? selectionNutrients(selection, Number(amount) || 0) : null

    const updateFoodState = (updated: Food) => {
        setLibraryFoods(current => current.map(food => (food.id === updated.id ? updated : food)))
        setFoodResults(current => current.map(food => (food.id === updated.id ? updated : food)))
        setSelection(current =>
            current?.kind === 'food' && current.food.id === updated.id
                ? { kind: 'food', food: updated }
                : current,
        )
    }

    const updateRecipeState = (updated: RecipeRecord) => {
        setRecipes(current => current.map(recipe => (recipe.id === updated.id ? updated : recipe)))
        setSelection(current =>
            current?.kind === 'recipe' && current.recipe.id === updated.id
                ? { kind: 'recipe', recipe: updated }
                : current,
        )
    }

    const toggleFavorite = async (item: Selection) => {
        if (item.kind === 'snapshot') return
        const key = selectionKey(item)
        const next = !selectionFavorite(item)
        setFavoriteBusy(key)
        setError('')
        try {
            if (item.kind === 'food') {
                const updated = await updateFood(item.food, {
                    ...foodUpdatePayload(item.food),
                    favorite: next,
                })
                updateFoodState(updated)
            } else {
                updateRecipeState(await setRecipeFavorite(item.recipe, next))
            }
            onFeedback?.(
                `${selectionName(item)} ${next ? 'added to favorites' : 'removed from favorites'}.`,
            )
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not update favorite.')
        } finally {
            setFavoriteBusy(null)
        }
    }

    const logSelection = async (item: Selection, consumedAmount: number, closeAfter: boolean) => {
        if (!recordedAt || !Number.isFinite(consumedAmount) || consumedAmount <= 0) return
        const key = selectionKey(item)
        setLoggingKey(key)
        setError('')
        try {
            const eatenAt = calendarLocalDateTimeToInstant(recordedAt, timezone).toISOString()
            const nutrients = selectionNutrients(item, consumedAmount)
            if (editMeal) {
                await updateMeal(editMeal.id, editMeal.version, {
                    name: selectionName(item),
                    mealType: mealType as MealRecord['mealType'],
                    eatenAt,
                    nutrients: nutrients as Record<string, number>,
                    nutritionQuality: selectionQuality(item) ?? 'complete',
                    serving:
                        item.kind === 'snapshot'
                            ? item.meal.serving
                                ? { amount: consumedAmount, unit: item.meal.serving.unit }
                                : { amount: consumedAmount, unit: 'serving' }
                            : {
                                  amount: consumedAmount,
                                  unit: item.kind === 'food' ? 'g' : 'serving',
                              },
                    foodId:
                        item.kind === 'food'
                            ? item.food.id
                            : item.kind === 'recipe'
                              ? null
                              : undefined,
                    recipeId:
                        item.kind === 'recipe'
                            ? item.recipe.id
                            : item.kind === 'food'
                              ? null
                              : undefined,
                })
                window.dispatchEvent(new Event('trackit:nutrition-changed'))
                window.dispatchEvent(new Event('trackit:observations-changed'))
                onFeedback?.(`${selectionName(item)} updated.`)
                onSaved?.()
            } else {
                await logMeal(
                    selectionName(item),
                    mealType,
                    nutrients,
                    selectionQuality(item),
                    item.kind === 'food' ? item.food.id : undefined,
                    eatenAt,
                    { amount: consumedAmount, unit: item.kind === 'food' ? 'g' : 'serving' },
                    item.kind === 'recipe' ? item.recipe.id : undefined,
                )
                window.dispatchEvent(new Event('trackit:nutrition-changed'))
                onFeedback?.(`${selectionName(item)} logged to ${mealType.toLowerCase()}.`)
                if (item.kind === 'food') {
                    setLibraryFoods(current => [
                        item.food,
                        ...current.filter(food => food.id !== item.food.id),
                    ])
                }
            }
            if (closeAfter) close()
        } catch {
            setError(
                editMeal
                    ? 'This meal could not be updated. Try again.'
                    : 'This meal could not be saved. Try again.',
            )
        } finally {
            setLoggingKey(null)
        }
    }

    const chooseSelection = (item: Selection) => {
        setSelection(item)
        setAmount(selectionDefaultAmount(item))
        setCatalogMode(null)
        setCatalogResults([])
        setCatalogError('')
    }

    const quickLog = (item: Selection) => {
        if (editMeal) {
            chooseSelection(item)
            return
        }
        return logSelection(item, selectionDefaultAmount(item), false)
    }

    const save = () => {
        if (!selection) return
        const consumedAmount = Number(amount)
        if (!Number.isFinite(consumedAmount) || consumedAmount <= 0) return
        void logSelection(selection, consumedAmount, true)
    }

    const favoriteButton = (item: Selection) => {
        if (item.kind === 'snapshot') return null
        const favorite = selectionFavorite(item)
        const name = selectionName(item)
        const key = selectionKey(item)
        return (
            <ActionIcon
                variant="subtle"
                color={favorite ? 'yellow' : 'gray'}
                className={`food-log-favorite${favorite ? ' food-log-favorite-active' : ''}`}
                aria-label={favorite ? `Remove ${name} from favorites` : `Mark ${name} as favorite`}
                title={favorite ? 'Remove from favorites' : 'Mark as favorite'}
                disabled={favoriteBusy === key}
                onClick={() => void toggleFavorite(item)}
            >
                {favoriteBusy === key ? (
                    <Loader size={14} />
                ) : (
                    <IconStar size={19} fill={favorite ? 'currentColor' : 'none'} />
                )}
            </ActionIcon>
        )
    }

    const resultRow = (item: Selection) => {
        const key = selectionKey(item)
        const summary = resultSummary(item)
        const name = selectionName(item)
        return (
            <div className="food-log-result" key={key}>
                {favoriteButton(item)}
                <button
                    type="button"
                    className="food-log-result-copy"
                    onClick={() => chooseSelection(item)}
                >
                    <span className="food-log-result-name">{name}</span>
                    <span className="food-log-result-meta">{selectionMeta(item)}</span>
                </button>
                <div className="food-log-result-nutrition">
                    <span>{summary.calories} kcal</span>
                    <span>{summary.protein} g protein</span>
                </div>
                <ActionIcon
                    variant="light"
                    color="trackit"
                    className="food-log-quick-add"
                    aria-label={editMeal ? `Choose ${name}` : `Quick log ${name}`}
                    title={
                        editMeal
                            ? `Choose ${name}`
                            : `Log ${item.kind === 'food' ? `${item.food.servingGrams} g` : '1 serving'}`
                    }
                    disabled={loggingKey !== null}
                    onClick={() => void quickLog(item)}
                >
                    {loggingKey === key ? (
                        <Loader size={14} />
                    ) : editMeal ? (
                        <IconCheck size={17} />
                    ) : (
                        <IconPlus size={17} />
                    )}
                </ActionIcon>
            </div>
        )
    }

    const runCatalogSearch = async () => {
        const value = query.trim()
        if (value.length < 2) return
        setCatalogMode('search')
        setCatalogBusy(true)
        setCatalogError('')
        setCatalogResults([])
        try {
            const results = await searchFoodCatalog(value)
            setCatalogResults(results)
            if (!results.length) setCatalogError('No catalog foods matched that search.')
        } catch (reason) {
            setCatalogError(reason instanceof Error ? reason.message : 'Catalog lookup failed.')
        } finally {
            setCatalogBusy(false)
        }
    }

    const runBarcodeLookup = async (value = barcode) => {
        const normalized = value.trim()
        setCatalogMode('barcode')
        setCatalogError('')
        setCatalogResults([])
        if (!/^\d{8,14}$/.test(normalized)) {
            setCatalogError('Enter an 8–14 digit EAN or UPC barcode.')
            return
        }
        setCatalogBusy(true)
        try {
            const result = await lookupCatalogBarcode(normalized)
            if (!result) setCatalogError('That barcode was not found.')
            else setCatalogResults([result])
        } catch (reason) {
            setCatalogError(reason instanceof Error ? reason.message : 'Catalog lookup failed.')
        } finally {
            setCatalogBusy(false)
        }
    }

    const scanImage = async (file: File) => {
        type Detector = new (options: { formats: string[] }) => {
            detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string }>>
        }
        const DetectorClass = (window as Window & { BarcodeDetector?: Detector }).BarcodeDetector
        if (!DetectorClass) {
            setCatalogMode('barcode')
            setCatalogError(
                'Camera barcode detection is not supported here. Type the barcode instead.',
            )
            return
        }
        setCatalogMode('barcode')
        setCatalogBusy(true)
        setCatalogError('')
        try {
            const bitmap = await createImageBitmap(file)
            const matches = await new DetectorClass({
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
            }).detect(bitmap)
            bitmap.close()
            const value = matches[0]?.rawValue
            if (!value) {
                setCatalogError('No barcode was detected. Try again with the code in focus.')
            } else {
                setBarcode(value)
                setCatalogBusy(false)
                await runBarcodeLookup(value)
            }
        } catch {
            setCatalogError('The barcode image could not be read. Type the digits instead.')
        } finally {
            setCatalogBusy(false)
            if (cameraInput.current) cameraInput.current.value = ''
        }
    }

    const saveCatalogFood = async (food: CatalogFood) => {
        setCatalogBusy(true)
        setCatalogError('')
        try {
            const created = await createFood(food)
            setLibraryFoods(current => [created, ...current.filter(item => item.id !== created.id)])
            chooseSelection({ kind: 'food', food: created })
            onFeedback?.(`${created.name} saved to your library.`)
        } catch {
            setCatalogError('This food could not be saved. It may already exist in your library.')
        } finally {
            setCatalogBusy(false)
        }
    }

    const openBarcode = () => {
        setCatalogMode('barcode')
        setCatalogResults([])
        setCatalogError('')
    }

    const historicalLabel = formatCalendarDate(recordedDate, locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: recordedDate.slice(0, 4) !== nowDay.slice(0, 4) ? 'numeric' : undefined,
    })
    const dateLabel = recordedDate === nowDay ? 'Today' : historicalLabel
    const footerLabel = selection
        ? `${editMeal ? 'Updates' : 'Adds to'} ${mealType.toLowerCase()} · ${dateLabel} at ${recordedTime}`
        : 'Choose a food to continue.'
    const selectionAmount = Number(amount)
    const selectionValid =
        Boolean(selection) &&
        Number.isFinite(selectionAmount) &&
        selectionAmount > 0 &&
        Boolean(recordedAt)

    return (
        <>
            <Modal
                opened={opened}
                onClose={close}
                title={<Text fw={750}>{editMeal ? 'Edit meal' : 'Log food'}</Text>}
                size="lg"
                className="food-logger"
                centered
            >
                <Stack gap="md">
                    <div className="food-log-context-row">
                        <Text
                            size="sm"
                            fw={700}
                            c={isHistorical ? 'orange' : 'trackit'}
                            className="food-log-context"
                        >
                            {mealType} · {dateLabel}, {recordedTime}
                        </Text>
                        <Button
                            variant="subtle"
                            color="trackit"
                            size="compact-xs"
                            onClick={() => setDetailsOpen(value => !value)}
                        >
                            {detailsOpen ? 'Done' : 'Edit'}
                        </Button>
                    </div>

                    {detailsOpen && (
                        <div className="food-log-details">
                            <SimpleGrid cols={{ base: 1, sm: 3 }}>
                                <Select
                                    label="Meal"
                                    value={mealType}
                                    onChange={value => value && setMealType(value)}
                                    data={['Breakfast', 'Lunch', 'Dinner', 'Snack']}
                                />
                                <TextInput
                                    type="date"
                                    label="Date"
                                    value={recordedDate}
                                    onChange={event =>
                                        setRecordedAt(
                                            `${event.currentTarget.value}T${recordedTime || '12:00'}`,
                                        )
                                    }
                                />
                                <TextInput
                                    type="time"
                                    label="Time"
                                    value={recordedTime}
                                    onChange={event =>
                                        setRecordedAt(
                                            `${recordedDate}T${event.currentTarget.value}`,
                                        )
                                    }
                                />
                            </SimpleGrid>
                            <Text size="xs" c="dimmed" mt="xs">
                                Date and time are interpreted in {timezone}.
                            </Text>
                        </div>
                    )}

                    <TextInput
                        ref={searchRef}
                        autoFocus
                        size="md"
                        radius="md"
                        placeholder={
                            editMeal
                                ? 'Search foods and recipes to replace…'
                                : 'Search foods and recipes…'
                        }
                        aria-label="Search foods and recipes"
                        value={query}
                        leftSection={<IconSearch size={18} />}
                        rightSection={searching ? <Loader size={15} /> : undefined}
                        onChange={event => {
                            const value = event.currentTarget.value
                            setQuery(value)
                            setSelection(null)
                            setCatalogMode(null)
                            setCatalogResults([])
                            setCatalogError('')
                            if (!value.trim()) {
                                setFoodResults([])
                                setSearching(false)
                            }
                        }}
                    />

                    {selection ? (
                        <div className="food-log-selected">
                            <div className="food-log-selected-head">
                                <div className="food-log-selected-title">
                                    {favoriteButton(selection)}
                                    <div>
                                        <Text fw={750}>{selectionName(selection)}</Text>
                                        <Text size="xs" c="dimmed">
                                            {selectionMeta(selection)}
                                        </Text>
                                    </div>
                                </div>
                                <Button
                                    variant="subtle"
                                    color="trackit"
                                    size="compact-xs"
                                    onClick={() => {
                                        setSelection(null)
                                        requestAnimationFrame(() => searchRef.current?.focus())
                                    }}
                                >
                                    Change
                                </Button>
                            </div>

                            <div className="food-log-amount-row">
                                <NumberInput
                                    label={
                                        selection.kind === 'food' ||
                                        (selection.kind === 'snapshot' &&
                                            selection.meal.serving?.unit === 'g')
                                            ? 'Amount'
                                            : 'Servings'
                                    }
                                    value={amount}
                                    onChange={setAmount}
                                    min={0.01}
                                    decimalScale={2}
                                    suffix={
                                        selection.kind === 'food' ||
                                        (selection.kind === 'snapshot' &&
                                            selection.meal.serving?.unit === 'g')
                                            ? ' g'
                                            : undefined
                                    }
                                />
                                <div>
                                    <Text size="xs" fw={700} c="dimmed" mb={6}>
                                        Quick amounts
                                    </Text>
                                    <Group gap={6} wrap="wrap">
                                        {(selection.kind === 'food'
                                            ? [
                                                  { label: '100 g', value: 100 },
                                                  {
                                                      label: defaultServingLabel(selection.food),
                                                      value: selection.food.servingGrams,
                                                  },
                                                  ...(selection.food.servingOptions ?? []).map(
                                                      option => ({
                                                          label: option.label,
                                                          value: option.grams,
                                                      }),
                                                  ),
                                              ]
                                            : selection.kind === 'recipe' ||
                                                selection.meal.serving?.unit !== 'g'
                                              ? [
                                                    { label: '½ serving', value: 0.5 },
                                                    { label: '1 serving', value: 1 },
                                                    { label: '2 servings', value: 2 },
                                                ]
                                              : [
                                                    {
                                                        label: 'Original',
                                                        value: selectionDefaultAmount(selection),
                                                    },
                                                ]
                                        ).map(preset => (
                                            <Button
                                                key={`${preset.label}-${preset.value}`}
                                                variant={
                                                    Number(amount) === preset.value
                                                        ? 'light'
                                                        : 'default'
                                                }
                                                color="trackit"
                                                size="compact-sm"
                                                radius="xl"
                                                onClick={() => setAmount(preset.value)}
                                            >
                                                {preset.label}
                                            </Button>
                                        ))}
                                    </Group>
                                </div>
                            </div>

                            <div className="food-log-nutrients">
                                <div>
                                    <strong>{Math.round(nutrients?.calories ?? 0)}</strong>
                                    <span>kcal</span>
                                </div>
                                <div>
                                    <strong>
                                        {Math.round((nutrients?.protein ?? 0) * 10) / 10} g
                                    </strong>
                                    <span>protein</span>
                                </div>
                                <div>
                                    <strong>
                                        {Math.round((nutrients?.carbs ?? 0) * 10) / 10} g
                                    </strong>
                                    <span>carbs</span>
                                </div>
                                <div>
                                    <strong>{Math.round((nutrients?.fat ?? 0) * 10) / 10} g</strong>
                                    <span>fat</span>
                                </div>
                            </div>
                        </div>
                    ) : queryValue ? (
                        <>
                            {localResults.length > 0 && (
                                <section className="food-log-section">
                                    <Text className="food-log-section-title">
                                        Results for “{query.trim()}”
                                    </Text>
                                    <div className="food-log-result-list">
                                        {localResults.map(resultRow)}
                                    </div>
                                </section>
                            )}

                            {!searching && localResults.length === 0 && !catalogMode && (
                                <div className="food-log-empty-search">
                                    <Text fw={700}>No saved foods match “{query.trim()}”</Text>
                                    <Text size="sm" c="dimmed">
                                        Keep going without leaving the food logger.
                                    </Text>
                                    <Stack gap={7} mt="md">
                                        <button
                                            type="button"
                                            className="food-log-continuation"
                                            onClick={() => void runCatalogSearch()}
                                        >
                                            <span>
                                                <strong>
                                                    Search food catalog for “{query.trim()}”
                                                </strong>
                                                <small>
                                                    Find a branded food and save it as you log
                                                </small>
                                            </span>
                                            <span>→</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="food-log-continuation"
                                            onClick={openBarcode}
                                        >
                                            <span>
                                                <strong>Scan barcode</strong>
                                                <small>Use your camera or enter the barcode</small>
                                            </span>
                                            <span>→</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="food-log-continuation"
                                            onClick={() => setCreating(true)}
                                        >
                                            <span>
                                                <strong>Create “{query.trim()}”</strong>
                                                <small>Add a custom food to your library</small>
                                            </span>
                                            <span>→</span>
                                        </button>
                                    </Stack>
                                </div>
                            )}

                            {catalogMode && (
                                <div className="food-log-catalog-inline">
                                    <div className="food-log-catalog-head">
                                        <div>
                                            <Text fw={700}>
                                                {catalogMode === 'search'
                                                    ? 'Catalog results'
                                                    : 'Scan barcode'}
                                            </Text>
                                            {catalogMode === 'search' && (
                                                <Text size="xs" c="dimmed">
                                                    Results for “{query.trim()}”
                                                </Text>
                                            )}
                                        </div>
                                        <Button
                                            variant="subtle"
                                            size="compact-xs"
                                            color="trackit"
                                            onClick={() => {
                                                setCatalogMode(null)
                                                setCatalogResults([])
                                                setCatalogError('')
                                            }}
                                        >
                                            Back
                                        </Button>
                                    </div>
                                    <Text size="xs" c="dimmed" mt={6}>
                                        Nutrition is per 100 g. Serving size is stored separately as
                                        a logging shortcut.
                                    </Text>

                                    {catalogMode === 'barcode' && (
                                        <Stack gap="xs" mt="sm">
                                            <TextInput
                                                label="EAN or UPC barcode"
                                                inputMode="numeric"
                                                value={barcode}
                                                leftSection={<IconBarcode size={17} />}
                                                onChange={event =>
                                                    setBarcode(event.currentTarget.value)
                                                }
                                                onKeyDown={event =>
                                                    event.key === 'Enter' && void runBarcodeLookup()
                                                }
                                            />
                                            <Group grow>
                                                <Button
                                                    variant="default"
                                                    leftSection={<IconCamera size={17} />}
                                                    onClick={() => cameraInput.current?.click()}
                                                >
                                                    Use camera
                                                </Button>
                                                <Button
                                                    color="trackit"
                                                    loading={catalogBusy}
                                                    onClick={() => void runBarcodeLookup()}
                                                >
                                                    Look up
                                                </Button>
                                            </Group>
                                            <input
                                                ref={cameraInput}
                                                hidden
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                aria-label="Take a barcode photo"
                                                onChange={event => {
                                                    const file = event.currentTarget.files?.[0]
                                                    if (file) void scanImage(file)
                                                }}
                                            />
                                        </Stack>
                                    )}

                                    {catalogBusy && catalogMode === 'search' && (
                                        <Group justify="center" py="md">
                                            <Loader size="sm" />
                                        </Group>
                                    )}
                                    {catalogError && (
                                        <Alert color="orange" mt="sm">
                                            {catalogError}
                                        </Alert>
                                    )}
                                    {catalogResults.length > 0 && (
                                        <div className="food-log-catalog-results">
                                            {catalogResults.map(food => {
                                                const preview = roundedNutrients(
                                                    catalogNutrients(food, food.servingGrams),
                                                )
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`${food.catalogSource}-${food.catalogId}-${food.name}`}
                                                        className="food-log-catalog-result"
                                                        disabled={catalogBusy}
                                                        onClick={() => void saveCatalogFood(food)}
                                                    >
                                                        <span>
                                                            <strong>{food.name}</strong>
                                                            <small>
                                                                {food.brand || 'No brand'} ·{' '}
                                                                {Math.round(
                                                                    food.per100g.calories ?? 0,
                                                                )}{' '}
                                                                kcal per 100 g ·{' '}
                                                                {Math.round(preview.calories ?? 0)}{' '}
                                                                kcal per {food.servingGrams} g
                                                                serving
                                                            </small>
                                                        </span>
                                                        <span>Save & choose</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : catalogMode === 'barcode' ? (
                        <div className="food-log-catalog-inline">
                            <div className="food-log-catalog-head">
                                <Text fw={700}>Scan barcode</Text>
                                <Button
                                    variant="subtle"
                                    size="compact-xs"
                                    color="trackit"
                                    onClick={() => {
                                        setCatalogMode(null)
                                        setCatalogResults([])
                                        setCatalogError('')
                                    }}
                                >
                                    Back
                                </Button>
                            </div>
                            <Text size="xs" c="dimmed" mt={6}>
                                Nutrition is per 100 g. Serving size is stored separately as a
                                logging shortcut.
                            </Text>
                            <Stack gap="xs" mt="sm">
                                <TextInput
                                    label="EAN or UPC barcode"
                                    inputMode="numeric"
                                    value={barcode}
                                    leftSection={<IconBarcode size={17} />}
                                    onChange={event => setBarcode(event.currentTarget.value)}
                                    onKeyDown={event =>
                                        event.key === 'Enter' && void runBarcodeLookup()
                                    }
                                />
                                <Group grow>
                                    <Button
                                        variant="default"
                                        leftSection={<IconCamera size={17} />}
                                        onClick={() => cameraInput.current?.click()}
                                    >
                                        Use camera
                                    </Button>
                                    <Button
                                        color="trackit"
                                        loading={catalogBusy}
                                        onClick={() => void runBarcodeLookup()}
                                    >
                                        Look up
                                    </Button>
                                </Group>
                                <input
                                    ref={cameraInput}
                                    hidden
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    aria-label="Take a barcode photo"
                                    onChange={event => {
                                        const file = event.currentTarget.files?.[0]
                                        if (file) void scanImage(file)
                                    }}
                                />
                            </Stack>
                            {catalogError && (
                                <Alert color="orange" mt="sm">
                                    {catalogError}
                                </Alert>
                            )}
                            {catalogResults.length > 0 && (
                                <div className="food-log-catalog-results">
                                    {catalogResults.map(food => (
                                        <button
                                            type="button"
                                            key={`${food.catalogSource}-${food.catalogId}-${food.name}`}
                                            className="food-log-catalog-result"
                                            disabled={catalogBusy}
                                            onClick={() => void saveCatalogFood(food)}
                                        >
                                            <span>
                                                <strong>{food.name}</strong>
                                                <small>
                                                    {food.brand || 'No brand'} ·{' '}
                                                    {Math.round(food.per100g.calories ?? 0)} kcal
                                                    per 100 g · serving {food.servingGrams} g
                                                </small>
                                            </span>
                                            <span>Save & choose</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : loadingLibrary ? (
                        <Group justify="center" py="xl">
                            <Loader size="sm" />
                        </Group>
                    ) : (
                        <>
                            {recent.length > 0 && (
                                <section className="food-log-section">
                                    <Text className="food-log-section-title">Recently logged</Text>
                                    <div className="food-log-result-list">
                                        {recent.map(resultRow)}
                                    </div>
                                </section>
                            )}
                            {favorites.length > 0 && (
                                <section className="food-log-section">
                                    <Text className="food-log-section-title">Favorites</Text>
                                    <div className="food-log-result-list">
                                        {favorites.slice(0, 8).map(resultRow)}
                                    </div>
                                </section>
                            )}
                            {recent.length === 0 && favorites.length === 0 && (
                                <div className="food-log-empty-library">
                                    <IconCheck size={20} />
                                    <div>
                                        <Text fw={700}>
                                            Your food library is ready for its first item
                                        </Text>
                                        <Text size="sm" c="dimmed">
                                            Search above, scan a barcode, or create a custom food.
                                        </Text>
                                    </div>
                                </div>
                            )}
                            <Group gap="xs">
                                <Button
                                    variant="default"
                                    leftSection={<IconBarcode size={17} />}
                                    onClick={openBarcode}
                                >
                                    Scan barcode
                                </Button>
                                <Button
                                    variant="subtle"
                                    color="trackit"
                                    onClick={() => setCreating(true)}
                                >
                                    Create food
                                </Button>
                            </Group>
                        </>
                    )}

                    {error && <Alert color="orange">{error}</Alert>}
                </Stack>

                <div className="food-log-footer">
                    <Text size="xs" c="dimmed" className="food-log-footer-note">
                        {footerLabel}
                    </Text>
                    <Button
                        color="trackit"
                        disabled={!selectionValid}
                        loading={selection ? loggingKey === selectionKey(selection) : false}
                        onClick={save}
                    >
                        {editMeal ? 'Save changes' : 'Log food'}
                    </Button>
                </div>
            </Modal>
            <NewFoodModal
                opened={creating}
                onClose={() => setCreating(false)}
                onCreate={food => {
                    setLibraryFoods(current => [food, ...current])
                    chooseSelection({ kind: 'food', food })
                    setCreating(false)
                }}
            />
        </>
    )
}
