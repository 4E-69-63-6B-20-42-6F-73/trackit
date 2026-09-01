import { useRef, useState } from 'react'
import { Alert, Badge, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { IconBarcode, IconCamera, IconSearch } from '@tabler/icons-react'
import type { Food } from '../domain/nutrition'
import { createFood, lookupCatalogBarcode, searchFoodCatalog } from '../lib/nutritionApi'

type CatalogFood = Omit<Food, 'id' | 'version'>

export function FoodCatalogLookup({ onCreated }: { onCreated: (food: Food) => void }) {
    const cameraInput = useRef<HTMLInputElement>(null)
    const [opened, setOpened] = useState(false)
    const [mode, setMode] = useState<'barcode' | 'search'>('barcode')
    const [value, setValue] = useState('')
    const [selected, setSelected] = useState<CatalogFood | null>(null)
    const [localError, setLocalError] = useState('')
    const [cameraBusy, setCameraBusy] = useState(false)

    const lookupMutation = useMutation({
        mutationFn: async ({ lookupMode, term }: { lookupMode: 'barcode' | 'search'; term: string }) => {
            if (lookupMode === 'barcode') {
                const food = await lookupCatalogBarcode(term)
                return food ? [food] : []
            }
            return searchFoodCatalog(term)
        },
        onSuccess: results => {
            setSelected(results.length === 1 ? results[0] : null)
        },
    })

    const saveMutation = useMutation({
        mutationFn: (food: CatalogFood) => createFood(food),
        onSuccess: created => {
            onCreated(created)
            setOpened(false)
            setValue('')
            setSelected(null)
            setLocalError('')
            lookupMutation.reset()
        },
    })

    const results = lookupMutation.data ?? []
    const busy = lookupMutation.isPending || saveMutation.isPending || cameraBusy
    const serverError = lookupMutation.isError
        ? lookupMutation.error instanceof Error
            ? lookupMutation.error.message
            : 'Catalog lookup failed.'
        : saveMutation.isError
          ? 'This food could not be saved. It may already exist in your library.'
          : ''
    const emptyError =
        lookupMutation.isSuccess && results.length === 0
            ? mode === 'barcode'
                ? 'That barcode was not found. You can still create the food manually.'
                : 'No catalog foods matched that search.'
            : ''
    const error = localError || serverError || emptyError

    const scanImage = async (file: File) => {
        type Detector = new (options: { formats: string[] }) => {
            detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string }>>
        }
        const DetectorClass = (window as Window & { BarcodeDetector?: Detector }).BarcodeDetector
        if (!DetectorClass) {
            setLocalError(
                'Camera barcode detection is not supported in this browser. Type the barcode instead.',
            )
            return
        }
        setCameraBusy(true)
        setLocalError('')
        try {
            const bitmap = await createImageBitmap(file)
            const matches = await new DetectorClass({
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
            }).detect(bitmap)
            bitmap.close()
            const barcode = matches[0]?.rawValue
            if (!barcode)
                setLocalError(
                    'No barcode was detected. Try again with the code centered and in focus.',
                )
            else setValue(barcode)
        } catch {
            setLocalError('The barcode image could not be read. Type the digits instead.')
        } finally {
            setCameraBusy(false)
            if (cameraInput.current) cameraInput.current.value = ''
        }
    }

    const lookup = () => {
        const term = value.trim()
        setLocalError('')
        setSelected(null)
        saveMutation.reset()
        if (mode === 'barcode' && !/^\d{8,14}$/.test(term)) {
            setLocalError('Enter an 8–14 digit EAN or UPC barcode.')
            return
        }
        if (mode === 'search' && term.length < 2) {
            setLocalError('Enter at least two characters.')
            return
        }
        lookupMutation.mutate({ lookupMode: mode, term })
    }

    const changeMode = (next: 'barcode' | 'search') => {
        setMode(next)
        setSelected(null)
        setLocalError('')
        lookupMutation.reset()
        saveMutation.reset()
    }

    return (
        <>
            <Button
                variant="filled"
                color="trackit"
                size="sm"
                leftSection={<IconBarcode size={18} />}
                onClick={() => setOpened(true)}
            >
                Barcode or catalog
            </Button>
            <Modal
                opened={opened}
                onClose={() => setOpened(false)}
                title="Find a catalog food"
                size="lg"
                centered
            >
                <Stack>
                    <Text size="sm" c="dimmed">
                        Catalog queries are sent by your TrackIt server only when you search. Review
                        nutrition values before saving them to your private library.
                    </Text>
                    <Group gap="xs">
                        <Button
                            variant={mode === 'barcode' ? 'light' : 'default'}
                            onClick={() => changeMode('barcode')}
                        >
                            Barcode
                        </Button>
                        <Button
                            variant={mode === 'search' ? 'light' : 'default'}
                            onClick={() => changeMode('search')}
                        >
                            Name search
                        </Button>
                    </Group>
                    <TextInput
                        label={mode === 'barcode' ? 'EAN or UPC barcode' : 'Food name or brand'}
                        description={
                            mode === 'barcode'
                                ? 'Type, paste, or use a keyboard-style barcode scanner.'
                                : undefined
                        }
                        inputMode={mode === 'barcode' ? 'numeric' : 'search'}
                        value={value}
                        onChange={event => {
                            setValue(event.currentTarget.value)
                            setSelected(null)
                            setLocalError('')
                            lookupMutation.reset()
                            saveMutation.reset()
                        }}
                        onKeyDown={event => event.key === 'Enter' && lookup()}
                        leftSection={
                            mode === 'barcode' ? (
                                <IconBarcode size={17} />
                            ) : (
                                <IconSearch size={17} />
                            )
                        }
                    />
                    {mode === 'barcode' && (
                        <>
                            <Button
                                variant="default"
                                leftSection={<IconCamera size={17} />}
                                loading={cameraBusy}
                                onClick={() => cameraInput.current?.click()}
                            >
                                Scan with camera
                            </Button>
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
                        </>
                    )}
                    <Button loading={lookupMutation.isPending} onClick={lookup}>
                        Look up on server
                    </Button>
                    {error && <Alert color="orange">{error}</Alert>}
                    {results.length > 0 && (
                        <div className="catalog-results">
                            {results.map(food => (
                                <button
                                    type="button"
                                    className={selected === food ? 'selected' : ''}
                                    key={`${food.catalogId}-${food.name}`}
                                    onClick={() => setSelected(food)}
                                >
                                    <div>
                                        <Text fw={650}>{food.name}</Text>
                                        <Text size="sm" c="dimmed">
                                            {food.brand || 'No brand'} ·{' '}
                                            {food.per100g.calories === undefined
                                                ? 'Calories unknown'
                                                : `${Math.round(food.per100g.calories)} kcal per 100 g`}
                                        </Text>
                                    </div>
                                    <Badge
                                        color={
                                            food.nutritionQuality === 'complete' ? 'teal' : 'orange'
                                        }
                                    >
                                        {food.nutritionQuality}
                                    </Badge>
                                </button>
                            ))}
                        </div>
                    )}
                    {selected && (
                        <Alert color="teal" variant="light">
                            Saving creates a server-owned copy. Catalog updates will not silently
                            change historical meals.
                        </Alert>
                    )}
                    <Group justify="flex-end">
                        <Button variant="default" disabled={busy} onClick={() => setOpened(false)}>
                            Cancel
                        </Button>
                        <Button
                            loading={saveMutation.isPending}
                            disabled={!selected || busy}
                            onClick={() => selected && saveMutation.mutate(selected)}
                        >
                            Save to my library
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    )
}
