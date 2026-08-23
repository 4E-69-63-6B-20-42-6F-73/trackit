import { useRef, useState } from 'react'
import { Alert, Badge, Button, Group, Modal, Progress, Select, Stack, Text } from '@mantine/core'
import { IconDownload, IconUpload } from '@tabler/icons-react'
import { foodCsvTemplate, inspectFoodCsv, type FoodCsvInspection } from '../domain/foodCsv'
import type { Food } from '../domain/nutrition'
import { importFoods, searchFoods, type FoodImportResult } from '../lib/nutritionApi'

export function FoodCsvImport({ onImported }: { onImported: (foods: Food[]) => void }) {
    const input = useRef<HTMLInputElement>(null)
    const [opened, setOpened] = useState(false)
    const [status, setStatus] = useState('')
    const [busy, setBusy] = useState(false)
    const [inspection, setInspection] = useState<FoodCsvInspection | null>(null)
    const [result, setResult] = useState<FoodImportResult | null>(null)
    const [strategy, setStrategy] = useState<'skip' | 'update' | 'create'>('skip')
    const [fileName, setFileName] = useState('')

    const downloadTemplate = () => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(new Blob([foodCsvTemplate], { type: 'text/csv' }))
        link.download = 'trackit-food-import.csv'
        link.click()
        URL.revokeObjectURL(link.href)
    }

    const inspectFile = async (file: File) => {
        setStatus('')
        setResult(null)
        try {
            setInspection(inspectFoodCsv(await file.text()))
            setFileName(file.name)
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'The CSV could not be imported.')
        }
    }

    const commit = async () => {
        if (!inspection?.foods.length) return
        setBusy(true)
        setStatus('')
        try {
            const imported = await importFoods(inspection.foods, strategy)
            setResult(imported)
            const refreshed = await searchFoods()
            onImported(refreshed)
            setStatus(
                `${imported.created} created, ${imported.updated} updated, ${imported.skipped} skipped, ${imported.failed} failed.`,
            )
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'The CSV could not be imported.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <Button
                variant="default"
                leftSection={<IconUpload size={17} />}
                onClick={() => setOpened(true)}
            >
                Import CSV
            </Button>
            <Modal opened={opened} onClose={() => setOpened(false)} title="Import food catalog">
                <Stack>
                    <Text size="sm">
                        Upload a UTF-8 CSV, validate every row, review the mapping, then choose how
                        the server should handle duplicates. Nothing is saved before confirmation.
                    </Text>
                    <Group>
                        <Button
                            variant="default"
                            leftSection={<IconDownload size={17} />}
                            onClick={downloadTemplate}
                        >
                            Download template
                        </Button>
                        <Button onClick={() => input.current?.click()}>Choose CSV</Button>
                    </Group>
                    <input
                        ref={input}
                        hidden
                        type="file"
                        accept=".csv,text/csv"
                        aria-label="Food catalog CSV"
                        onChange={event => {
                            const file = event.currentTarget.files?.[0]
                            if (file) void inspectFile(file)
                        }}
                    />
                    {inspection && (
                        <>
                            <div className="import-summary">
                                <div>
                                    <Text size="xs" c="dimmed">
                                        File
                                    </Text>
                                    <Text fw={650}>{fileName}</Text>
                                </div>
                                <div>
                                    <Text size="xs" c="dimmed">
                                        Ready
                                    </Text>
                                    <Text fw={650}>{inspection.foods.length}</Text>
                                </div>
                                <div>
                                    <Text size="xs" c="dimmed">
                                        Invalid
                                    </Text>
                                    <Text fw={650}>
                                        {
                                            inspection.rows.filter(row => row.status === 'invalid')
                                                .length
                                        }
                                    </Text>
                                </div>
                            </div>
                            <Alert color="blue" variant="light">
                                Recognized columns:{' '}
                                {inspection.headers
                                    .filter(header =>
                                        [
                                            'name',
                                            'brand',
                                            'barcode',
                                            'calories_per_100g',
                                            'protein_per_100g',
                                            'carbs_per_100g',
                                            'fat_per_100g',
                                            'serving_name',
                                            'serving_grams',
                                        ].includes(header),
                                    )
                                    .join(', ')}
                            </Alert>
                            <div className="import-preview" aria-label="Import preview">
                                {inspection.rows.slice(0, 12).map(row => (
                                    <div key={row.row}>
                                        <Text size="sm">
                                            <strong>Row {row.row}</strong> Â· {row.name}
                                        </Text>
                                        <Badge color={row.status === 'ready' ? 'teal' : 'orange'}>
                                            {row.status}
                                        </Badge>
                                        {row.message && (
                                            <Text size="xs" c="orange">
                                                {row.message}
                                            </Text>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <Select
                                label="When a barcode or name and brand already exists"
                                value={strategy}
                                onChange={value => value && setStrategy(value as typeof strategy)}
                                data={[
                                    { value: 'skip', label: 'Skip existing foods (recommended)' },
                                    { value: 'update', label: 'Update existing nutrition values' },
                                    { value: 'create', label: 'Create another food' },
                                ]}
                                allowDeselect={false}
                            />
                            {busy && (
                                <Progress
                                    value={100}
                                    animated
                                    aria-label="Importing foods on server"
                                />
                            )}
                            <Button
                                loading={busy}
                                disabled={inspection.foods.length === 0}
                                onClick={() => void commit()}
                            >
                                Import {inspection.foods.length} valid{' '}
                                {inspection.foods.length === 1 ? 'food' : 'foods'}
                            </Button>
                        </>
                    )}
                    {status && <Alert>{status}</Alert>}
                    {result?.failed ? (
                        <Alert color="orange">
                            Failed rows:{' '}
                            {result.results
                                .filter(item => item.status === 'failed')
                                .map(item => item.index + 2)
                                .join(', ')}
                            . Correct those rows and import them again.
                        </Alert>
                    ) : null}
                </Stack>
            </Modal>
        </>
    )
}
