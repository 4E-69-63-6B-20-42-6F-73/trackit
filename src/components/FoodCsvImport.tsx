import { useRef, useState } from 'react'
import { Alert, Badge, Button, Group, Modal, Progress, Select, Stack, Text } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconDownload, IconUpload } from '@tabler/icons-react'
import { foodCsvTemplate, inspectFoodCsv, type FoodCsvInspection } from '@trackit/domain/foodCsv'
import type { Food } from '@trackit/domain/nutrition'
import { importFoods, searchFoods } from '../lib/nutritionApi'
import { serverQueryKeys } from '../lib/serverQueries'

export function FoodCsvImport({ onImported }: { onImported: (foods: Food[]) => void }) {
    const queryClient = useQueryClient()
    const input = useRef<HTMLInputElement>(null)
    const [opened, setOpened] = useState(false)
    const [inspection, setInspection] = useState<FoodCsvInspection | null>(null)
    const [strategy, setStrategy] = useState<'skip' | 'update' | 'create'>('skip')
    const [fileName, setFileName] = useState('')
    const [inspectionError, setInspectionError] = useState('')

    const importMutation = useMutation({
        mutationFn: () => {
            if (!inspection?.foods.length) throw new Error('No valid foods to import.')
            return importFoods(inspection.foods, strategy)
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: serverQueryKeys.foods })
            const refreshed = await queryClient.fetchQuery({
                queryKey: [...serverQueryKeys.foods, ''],
                queryFn: () => searchFoods(''),
            })
            onImported(refreshed)
        },
    })

    const result = importMutation.data
    const status = result
        ? `${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed.`
        : importMutation.isError
          ? importMutation.error instanceof Error
              ? importMutation.error.message
              : 'The CSV could not be imported.'
          : inspectionError

    const downloadTemplate = () => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(new Blob([foodCsvTemplate], { type: 'text/csv' }))
        link.download = 'trackit-food-import.csv'
        link.click()
        URL.revokeObjectURL(link.href)
    }

    const inspectFile = async (file: File) => {
        setInspectionError('')
        importMutation.reset()
        try {
            setInspection(inspectFoodCsv(await file.text()))
            setFileName(file.name)
        } catch (error) {
            setInspectionError(
                error instanceof Error ? error.message : 'The CSV could not be imported.',
            )
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
                                            <strong>Row {row.row}</strong> · {row.name}
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
                            {importMutation.isPending && (
                                <Progress
                                    value={100}
                                    animated
                                    aria-label="Importing foods on server"
                                />
                            )}
                            <Button
                                loading={importMutation.isPending}
                                disabled={inspection.foods.length === 0}
                                onClick={() => importMutation.mutate()}
                            >
                                Import {inspection.foods.length} valid{' '}
                                {inspection.foods.length === 1 ? 'food' : 'foods'}
                            </Button>
                        </>
                    )}
                    {status && (
                        <Alert
                            color={importMutation.isError || inspectionError ? 'orange' : undefined}
                        >
                            {status}
                        </Alert>
                    )}
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
