import { useRef, useState } from 'react'
import { Alert, Badge, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core'
import { IconBarcode, IconCamera, IconSearch } from '@tabler/icons-react'
import type { Food } from '../domain/nutrition'
import { createFood, lookupCatalogBarcode, searchFoodCatalog } from '../lib/nutritionApi'

export function FoodCatalogLookup({ onCreated }: { onCreated: (food: Food) => void }) {
    const cameraInput = useRef<HTMLInputElement>(null)
    const [opened, setOpened] = useState(false)
    const [mode, setMode] = useState<'barcode' | 'search'>('barcode')
    const [value, setValue] = useState('')
    const [results, setResults] = useState<Array<Omit<Food, 'id' | 'version'>>>([])
    const [selected, setSelected] = useState<Omit<Food, 'id' | 'version'> | null>(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    const scanImage = async (file: File) => {
        type Detector = new (options: { formats: string[] }) => {
            detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string }>>
        }
        const DetectorClass = (window as Window & { BarcodeDetector?: Detector }).BarcodeDetector
        if (!DetectorClass) {
            setError(
                'Camera barcode detection is not supported in this browser. Type the barcode instead.',
            )
            return
        }
        setBusy(true)
        setError('')
        try {
            const bitmap = await createImageBitmap(file)
            const matches = await new DetectorClass({
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
            }).detect(bitmap)
            bitmap.close()
            const barcode = matches[0]?.rawValue
            if (!barcode)
                setError('No barcode was detected. Try again with the code centered and in focus.')
            else setValue(barcode)
        } catch {
            setError('The barcode image could not be read. Type the digits instead.')
        } finally {
            setBusy(false)
            if (cameraInput.current) cameraInput.current.value = ''
        }
    }

    const lookup = async () => {
        setBusy(true)
        setError('')
        setResults([])
        setSelected(null)
        try {
            if (mode === 'barcode') {
                if (!/^\d{8,14}$/.test(value.trim())) {
                    setError('Enter an 8–14 digit EAN or UPC barcode.')
                    return
                }
                const food = await lookupCatalogBarcode(value.trim())
                if (!food)
                    setError('That barcode was not found. You can still create the food manually.')
                else {
                    setResults([food])
                    setSelected(food)
                }
            } else {
                if (value.trim().length < 2) {
                    setError('Enter at least two characters.')
                    return
                }
                const foods = await searchFoodCatalog(value.trim())
                setResults(foods)
                if (foods.length === 0) setError('No catalog foods matched that search.')
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Catalog lookup failed.')
        } finally {
            setBusy(false)
        }
    }

    const save = async () => {
        if (!selected) return
        setBusy(true)
        setError('')
        try {
            const created = await createFood(selected)
            onCreated(created)
            setOpened(false)
            setValue('')
            setResults([])
            setSelected(null)
        } catch {
            setError('This food could not be saved. It may already exist in your library.')
        } finally {
            setBusy(false)
        }
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
                            onClick={() => setMode('barcode')}
                        >
                            Barcode
                        </Button>
                        <Button
                            variant={mode === 'search' ? 'light' : 'default'}
                            onClick={() => setMode('search')}
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
                        onChange={event => setValue(event.currentTarget.value)}
                        onKeyDown={event => event.key === 'Enter' && void lookup()}
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
                    <Button loading={busy} onClick={() => void lookup()}>
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
                                            {food.brand || 'No brand'} Â·{' '}
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
                        <Button variant="default" onClick={() => setOpened(false)}>
                            Cancel
                        </Button>
                        <Button loading={busy} disabled={!selected} onClick={() => void save()}>
                            Save to my library
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    )
}
