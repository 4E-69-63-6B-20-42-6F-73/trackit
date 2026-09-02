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
import { roundedNutrients, type Nutrients } from '@trackit/domain/nutrition'
import type { RefObject } from 'react'
import {
    catalogNutrients,
    quickAmounts,
    resultSummary,
    selectionFavorite,
    selectionKey,
    selectionMeta,
    selectionName,
    type CatalogFood,
    type FoodLoggerSelection,
} from './foodLoggerModel'

export type FoodLoggerViewProps = {
    opened: boolean
    editMode: boolean
    timezone: string
    mealType: string
    recordedDate: string
    recordedTime: string
    dateLabel: string
    isHistorical: boolean
    detailsOpen: boolean
    query: string
    searching: boolean
    selection: FoodLoggerSelection | null
    amount: number | string
    nutrients: Partial<Nutrients> | null
    localResults: FoodLoggerSelection[]
    favorites: FoodLoggerSelection[]
    recent: FoodLoggerSelection[]
    loadingLibrary: boolean
    loggingKey: string | null
    favoriteBusy: string | null
    error: string
    catalogMode: 'search' | 'barcode' | null
    catalogResults: CatalogFood[]
    catalogBusy: boolean
    catalogError: string
    barcode: string
    footerLabel: string
    selectionValid: boolean
    searchRef: RefObject<HTMLInputElement | null>
    cameraInput: RefObject<HTMLInputElement | null>
    onClose: () => void
    onToggleDetails: () => void
    onMealTypeChange: (value: string) => void
    onRecordedDateChange: (value: string) => void
    onRecordedTimeChange: (value: string) => void
    onQueryChange: (value: string) => void
    onClearSelection: () => void
    onChooseSelection: (selection: FoodLoggerSelection) => void
    onQuickLog: (selection: FoodLoggerSelection) => void
    onToggleFavorite: (selection: FoodLoggerSelection) => void
    onAmountChange: (value: number | string) => void
    onCatalogSearch: () => void
    onOpenBarcode: () => void
    onCloseCatalog: () => void
    onBarcodeChange: (value: string) => void
    onBarcodeLookup: () => void
    onCameraOpen: () => void
    onCameraFile: (file: File) => void
    onSaveCatalogFood: (food: CatalogFood) => void
    onCreateFood: () => void
    onSave: () => void
}

function FavoriteButton({
    item,
    busyKey,
    onToggle,
}: {
    item: FoodLoggerSelection
    busyKey: string | null
    onToggle: (selection: FoodLoggerSelection) => void
}) {
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
            disabled={busyKey === key}
            onClick={() => onToggle(item)}
        >
            {busyKey === key ? (
                <Loader size={14} />
            ) : (
                <IconStar size={19} fill={favorite ? 'currentColor' : 'none'} />
            )}
        </ActionIcon>
    )
}

function ResultRow({
    item,
    editMode,
    loggingKey,
    favoriteBusy,
    onChoose,
    onQuickLog,
    onToggleFavorite,
}: {
    item: FoodLoggerSelection
    editMode: boolean
    loggingKey: string | null
    favoriteBusy: string | null
    onChoose: (selection: FoodLoggerSelection) => void
    onQuickLog: (selection: FoodLoggerSelection) => void
    onToggleFavorite: (selection: FoodLoggerSelection) => void
}) {
    const key = selectionKey(item)
    const summary = resultSummary(item)
    const name = selectionName(item)
    return (
        <div className="food-log-result">
            <FavoriteButton item={item} busyKey={favoriteBusy} onToggle={onToggleFavorite} />
            <button type="button" className="food-log-result-copy" onClick={() => onChoose(item)}>
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
                aria-label={editMode ? `Choose ${name}` : `Quick log ${name}`}
                title={
                    editMode
                        ? `Choose ${name}`
                        : `Log ${item.kind === 'food' ? `${item.food.servingGrams} g` : '1 serving'}`
                }
                disabled={loggingKey !== null}
                onClick={() => onQuickLog(item)}
            >
                {loggingKey === key ? (
                    <Loader size={14} />
                ) : editMode ? (
                    <IconCheck size={17} />
                ) : (
                    <IconPlus size={17} />
                )}
            </ActionIcon>
        </div>
    )
}

function CatalogResults({
    results,
    busy,
    onSave,
}: {
    results: CatalogFood[]
    busy: boolean
    onSave: (food: CatalogFood) => void
}) {
    if (!results.length) return null
    return (
        <div className="food-log-catalog-results">
            {results.map(food => {
                const preview = roundedNutrients(catalogNutrients(food, food.servingGrams))
                return (
                    <button
                        type="button"
                        key={`${food.catalogSource}-${food.catalogId}-${food.name}`}
                        className="food-log-catalog-result"
                        disabled={busy}
                        onClick={() => onSave(food)}
                    >
                        <span>
                            <strong>{food.name}</strong>
                            <small>
                                {food.brand || 'No brand'} ·{' '}
                                {Math.round(food.per100g.calories ?? 0)} kcal per 100 g ·{' '}
                                {Math.round(preview.calories ?? 0)} kcal per {food.servingGrams} g
                                serving
                            </small>
                        </span>
                        <span>Save & choose</span>
                    </button>
                )
            })}
        </div>
    )
}

function BarcodePanel({
    barcode,
    busy,
    error,
    results,
    cameraInput,
    onBarcodeChange,
    onLookup,
    onCameraOpen,
    onCameraFile,
    onSave,
}: {
    barcode: string
    busy: boolean
    error: string
    results: CatalogFood[]
    cameraInput: RefObject<HTMLInputElement | null>
    onBarcodeChange: (value: string) => void
    onLookup: () => void
    onCameraOpen: () => void
    onCameraFile: (file: File) => void
    onSave: (food: CatalogFood) => void
}) {
    return (
        <>
            <Stack gap="xs" mt="sm">
                <TextInput
                    label="EAN or UPC barcode"
                    inputMode="numeric"
                    value={barcode}
                    leftSection={<IconBarcode size={17} />}
                    onChange={event => onBarcodeChange(event.currentTarget.value)}
                    onKeyDown={event => event.key === 'Enter' && onLookup()}
                />
                <Group grow>
                    <Button
                        variant="default"
                        leftSection={<IconCamera size={17} />}
                        onClick={onCameraOpen}
                    >
                        Use camera
                    </Button>
                    <Button color="trackit" loading={busy} onClick={onLookup}>
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
                        if (file) onCameraFile(file)
                    }}
                />
            </Stack>
            {error && (
                <Alert color="orange" mt="sm">
                    {error}
                </Alert>
            )}
            <CatalogResults results={results} busy={busy} onSave={onSave} />
        </>
    )
}

export function FoodLoggerView(props: FoodLoggerViewProps) {
    const {
        opened,
        editMode,
        timezone,
        mealType,
        recordedDate,
        recordedTime,
        dateLabel,
        isHistorical,
        detailsOpen,
        query,
        searching,
        selection,
        amount,
        nutrients,
        localResults,
        favorites,
        recent,
        loadingLibrary,
        loggingKey,
        favoriteBusy,
        error,
        catalogMode,
        catalogResults,
        catalogBusy,
        catalogError,
        barcode,
        footerLabel,
        selectionValid,
        searchRef,
        cameraInput,
        onClose,
        onToggleDetails,
        onMealTypeChange,
        onRecordedDateChange,
        onRecordedTimeChange,
        onQueryChange,
        onClearSelection,
        onChooseSelection,
        onQuickLog,
        onToggleFavorite,
        onAmountChange,
        onCatalogSearch,
        onOpenBarcode,
        onCloseCatalog,
        onBarcodeChange,
        onBarcodeLookup,
        onCameraOpen,
        onCameraFile,
        onSaveCatalogFood,
        onCreateFood,
        onSave,
    } = props
    const queryValue = query.trim()

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={<Text fw={750}>{editMode ? 'Edit meal' : 'Log food'}</Text>}
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
                        onClick={onToggleDetails}
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
                                onChange={value => value && onMealTypeChange(value)}
                                data={['Breakfast', 'Lunch', 'Dinner', 'Snack']}
                            />
                            <TextInput
                                type="date"
                                label="Date"
                                value={recordedDate}
                                onChange={event => onRecordedDateChange(event.currentTarget.value)}
                            />
                            <TextInput
                                type="time"
                                label="Time"
                                value={recordedTime}
                                onChange={event => onRecordedTimeChange(event.currentTarget.value)}
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
                        editMode
                            ? 'Search foods and recipes to replace…'
                            : 'Search foods and recipes…'
                    }
                    aria-label="Search foods and recipes"
                    value={query}
                    leftSection={<IconSearch size={18} />}
                    rightSection={searching ? <Loader size={15} /> : undefined}
                    onChange={event => onQueryChange(event.currentTarget.value)}
                />

                {selection ? (
                    <div className="food-log-selected">
                        <div className="food-log-selected-head">
                            <div className="food-log-selected-title">
                                <FavoriteButton
                                    item={selection}
                                    busyKey={favoriteBusy}
                                    onToggle={onToggleFavorite}
                                />
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
                                onClick={onClearSelection}
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
                                onChange={onAmountChange}
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
                                    {quickAmounts(selection).map(preset => (
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
                                            onClick={() => onAmountChange(preset.value)}
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
                                <strong>{Math.round((nutrients?.protein ?? 0) * 10) / 10} g</strong>
                                <span>protein</span>
                            </div>
                            <div>
                                <strong>{Math.round((nutrients?.carbs ?? 0) * 10) / 10} g</strong>
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
                                    Results for “{queryValue}”
                                </Text>
                                <div className="food-log-result-list">
                                    {localResults.map(item => (
                                        <ResultRow
                                            key={selectionKey(item)}
                                            item={item}
                                            editMode={editMode}
                                            loggingKey={loggingKey}
                                            favoriteBusy={favoriteBusy}
                                            onChoose={onChooseSelection}
                                            onQuickLog={onQuickLog}
                                            onToggleFavorite={onToggleFavorite}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {!searching && localResults.length === 0 && !catalogMode && (
                            <div className="food-log-empty-search">
                                <Text fw={700}>No saved foods match “{queryValue}”</Text>
                                <Text size="sm" c="dimmed">
                                    Keep going without leaving the food logger.
                                </Text>
                                <Stack gap={7} mt="md">
                                    <button
                                        type="button"
                                        className="food-log-continuation"
                                        onClick={onCatalogSearch}
                                    >
                                        <span>
                                            <strong>Search food catalog for “{queryValue}”</strong>
                                            <small>
                                                Find a branded food and save it as you log
                                            </small>
                                        </span>
                                        <span>→</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="food-log-continuation"
                                        onClick={onOpenBarcode}
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
                                        onClick={onCreateFood}
                                    >
                                        <span>
                                            <strong>Create “{queryValue}”</strong>
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
                                                Results for “{queryValue}”
                                            </Text>
                                        )}
                                    </div>
                                    <Button
                                        variant="subtle"
                                        size="compact-xs"
                                        color="trackit"
                                        onClick={onCloseCatalog}
                                    >
                                        Back
                                    </Button>
                                </div>
                                <Text size="xs" c="dimmed" mt={6}>
                                    Nutrition is per 100 g. Serving size is stored separately as a
                                    logging shortcut.
                                </Text>

                                {catalogMode === 'barcode' && (
                                    <BarcodePanel
                                        barcode={barcode}
                                        busy={catalogBusy}
                                        error={catalogError}
                                        results={catalogResults}
                                        cameraInput={cameraInput}
                                        onBarcodeChange={onBarcodeChange}
                                        onLookup={onBarcodeLookup}
                                        onCameraOpen={onCameraOpen}
                                        onCameraFile={onCameraFile}
                                        onSave={onSaveCatalogFood}
                                    />
                                )}
                                {catalogBusy && catalogMode === 'search' && (
                                    <Group justify="center" py="md">
                                        <Loader size="sm" />
                                    </Group>
                                )}
                                {catalogMode === 'search' && catalogError && (
                                    <Alert color="orange" mt="sm">
                                        {catalogError}
                                    </Alert>
                                )}
                                {catalogMode === 'search' && (
                                    <CatalogResults
                                        results={catalogResults}
                                        busy={catalogBusy}
                                        onSave={onSaveCatalogFood}
                                    />
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
                                onClick={onCloseCatalog}
                            >
                                Back
                            </Button>
                        </div>
                        <Text size="xs" c="dimmed" mt={6}>
                            Nutrition is per 100 g. Serving size is stored separately as a logging
                            shortcut.
                        </Text>
                        <BarcodePanel
                            barcode={barcode}
                            busy={catalogBusy}
                            error={catalogError}
                            results={catalogResults}
                            cameraInput={cameraInput}
                            onBarcodeChange={onBarcodeChange}
                            onLookup={onBarcodeLookup}
                            onCameraOpen={onCameraOpen}
                            onCameraFile={onCameraFile}
                            onSave={onSaveCatalogFood}
                        />
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
                                    {recent.map(item => (
                                        <ResultRow
                                            key={selectionKey(item)}
                                            item={item}
                                            editMode={editMode}
                                            loggingKey={loggingKey}
                                            favoriteBusy={favoriteBusy}
                                            onChoose={onChooseSelection}
                                            onQuickLog={onQuickLog}
                                            onToggleFavorite={onToggleFavorite}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}
                        {favorites.length > 0 && (
                            <section className="food-log-section">
                                <Text className="food-log-section-title">Favorites</Text>
                                <div className="food-log-result-list">
                                    {favorites.slice(0, 8).map(item => (
                                        <ResultRow
                                            key={selectionKey(item)}
                                            item={item}
                                            editMode={editMode}
                                            loggingKey={loggingKey}
                                            favoriteBusy={favoriteBusy}
                                            onChoose={onChooseSelection}
                                            onQuickLog={onQuickLog}
                                            onToggleFavorite={onToggleFavorite}
                                        />
                                    ))}
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
                                onClick={onOpenBarcode}
                            >
                                Scan barcode
                            </Button>
                            <Button variant="subtle" color="trackit" onClick={onCreateFood}>
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
                    onClick={onSave}
                >
                    {editMode ? 'Save changes' : 'Log food'}
                </Button>
            </div>
        </Modal>
    )
}
