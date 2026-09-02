import { useEffect, useMemo, useRef, useState } from 'react'
import {
    calendarLocalDateTimeToInstant,
    calendarLocalDateTimeValue,
    calendarTodayKey,
    formatCalendarDate,
} from '@trackit/domain/calendar'
import type { Food } from '@trackit/domain/nutrition'
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
import { FoodLoggerView } from './FoodLoggerView'
import {
    foodUpdatePayload,
    selectionDefaultAmount,
    selectionFavorite,
    selectionKey,
    selectionName,
    selectionNutrients,
    selectionQuality,
    selectionServing,
    selectionSource,
    type CatalogFood,
    type FoodLoggerSelection,
} from './foodLoggerModel'

type FoodLoggerProps = {
    opened: boolean
    close: () => void
    selectedDate?: string | null
    onFeedback?: (message: string) => void
    editMeal?: MealRecord
    onSaved?: () => void
}

export function FoodLogger({
    opened,
    close,
    selectedDate,
    onFeedback,
    editMeal,
    onSaved,
}: FoodLoggerProps) {
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
    const [mealType, setMealType] = useState<MealRecord['mealType']>(
        editMeal?.mealType ??
            (hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : hour < 21 ? 'Dinner' : 'Snack'),
    )
    const [query, setQuery] = useState('')
    const [libraryFoods, setLibraryFoods] = useState<Food[]>([])
    const [foodResults, setFoodResults] = useState<Food[]>([])
    const [recipes, setRecipes] = useState<RecipeRecord[]>([])
    const [selection, setSelection] = useState<FoodLoggerSelection | null>(
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
    const localResults: FoodLoggerSelection[] = [
        ...foodResults.map(food => ({ kind: 'food' as const, food })),
        ...recipeResults.map(recipe => ({ kind: 'recipe' as const, recipe })),
    ]
    const favorites: FoodLoggerSelection[] = [
        ...libraryFoods
            .filter(food => food.favorite)
            .map(food => ({ kind: 'food' as const, food })),
        ...recipes
            .filter(recipe => recipe.favorite)
            .map(recipe => ({ kind: 'recipe' as const, recipe })),
    ]
    const recent: FoodLoggerSelection[] = libraryFoods
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

    const toggleFavorite = async (item: FoodLoggerSelection) => {
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

    const logSelection = async (
        item: FoodLoggerSelection,
        consumedAmount: number,
        closeAfter: boolean,
    ) => {
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
                    mealType,
                    eatenAt,
                    nutrients: nutrients as Record<string, number>,
                    nutritionQuality: selectionQuality(item) ?? 'complete',
                    serving: selectionServing(item, consumedAmount),
                    ...selectionSource(item),
                })
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
                    selectionServing(item, consumedAmount),
                    item.kind === 'recipe' ? item.recipe.id : undefined,
                )
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

    const chooseSelection = (item: FoodLoggerSelection) => {
        setSelection(item)
        setAmount(selectionDefaultAmount(item))
        setCatalogMode(null)
        setCatalogResults([])
        setCatalogError('')
    }

    const quickLog = (item: FoodLoggerSelection) => {
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

    const closeCatalog = () => {
        setCatalogMode(null)
        setCatalogResults([])
        setCatalogError('')
    }

    const openBarcode = () => {
        setCatalogMode('barcode')
        setCatalogResults([])
        setCatalogError('')
    }

    const changeQuery = (value: string) => {
        setQuery(value)
        setSelection(null)
        closeCatalog()
        if (!value.trim()) {
            setFoodResults([])
            setSearching(false)
        }
    }

    const clearSelection = () => {
        setSelection(null)
        requestAnimationFrame(() => searchRef.current?.focus())
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
            <FoodLoggerView
                opened={opened}
                editMode={Boolean(editMeal)}
                timezone={timezone}
                mealType={mealType}
                recordedDate={recordedDate}
                recordedTime={recordedTime}
                dateLabel={dateLabel}
                isHistorical={isHistorical}
                detailsOpen={detailsOpen}
                query={query}
                searching={searching}
                selection={selection}
                amount={amount}
                nutrients={nutrients}
                localResults={localResults}
                favorites={favorites}
                recent={recent}
                loadingLibrary={loadingLibrary}
                loggingKey={loggingKey}
                favoriteBusy={favoriteBusy}
                error={error}
                catalogMode={catalogMode}
                catalogResults={catalogResults}
                catalogBusy={catalogBusy}
                catalogError={catalogError}
                barcode={barcode}
                footerLabel={footerLabel}
                selectionValid={selectionValid}
                searchRef={searchRef}
                cameraInput={cameraInput}
                onClose={close}
                onToggleDetails={() => setDetailsOpen(value => !value)}
                onMealTypeChange={value => setMealType(value as MealRecord['mealType'])}
                onRecordedDateChange={value =>
                    setRecordedAt(`${value}T${recordedTime || '12:00'}`)
                }
                onRecordedTimeChange={value => setRecordedAt(`${recordedDate}T${value}`)}
                onQueryChange={changeQuery}
                onClearSelection={clearSelection}
                onChooseSelection={chooseSelection}
                onQuickLog={item => void quickLog(item)}
                onToggleFavorite={item => void toggleFavorite(item)}
                onAmountChange={setAmount}
                onCatalogSearch={() => void runCatalogSearch()}
                onOpenBarcode={openBarcode}
                onCloseCatalog={closeCatalog}
                onBarcodeChange={setBarcode}
                onBarcodeLookup={() => void runBarcodeLookup()}
                onCameraOpen={() => cameraInput.current?.click()}
                onCameraFile={file => void scanImage(file)}
                onSaveCatalogFood={food => void saveCatalogFood(food)}
                onCreateFood={() => setCreating(true)}
                onSave={save}
            />
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
