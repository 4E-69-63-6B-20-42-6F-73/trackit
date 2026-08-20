import { useRef, useState } from 'react'
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { IconDownload, IconUpload } from '@tabler/icons-react'
import { foodCsvTemplate, parseFoodCsv } from '../domain/foodCsv'
import type { Food } from '../domain/nutrition'
import { createFood } from '../lib/nutritionApi'

export function FoodCsvImport({ onImported }: { onImported: (foods: Food[]) => void }) {
    const input = useRef<HTMLInputElement>(null)
    const [opened, setOpened] = useState(false)
    const [status, setStatus] = useState('')
    const [busy, setBusy] = useState(false)

    const downloadTemplate = () => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(new Blob([foodCsvTemplate], { type: 'text/csv' }))
        link.download = 'trackit-food-import.csv'
        link.click()
        URL.revokeObjectURL(link.href)
    }

    const importFile = async (file: File) => {
        setBusy(true)
        setStatus('')
        try {
            const parsed = parseFoodCsv(await file.text())
            const imported: Food[] = []
            for (const food of parsed) imported.push(await createFood(food))
            onImported(imported)
            setStatus(`${imported.length} foods imported successfully.`)
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'The CSV could not be imported.')
        } finally {
            setBusy(false)
            if (input.current) input.current.value = ''
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
                        Upload a UTF-8 CSV. Review the template headers before importing; every
                        valid row becomes a local catalog food.
                    </Text>
                    <Group>
                        <Button
                            variant="default"
                            leftSection={<IconDownload size={17} />}
                            onClick={downloadTemplate}
                        >
                            Download template
                        </Button>
                        <Button loading={busy} onClick={() => input.current?.click()}>
                            Choose CSV
                        </Button>
                    </Group>
                    <input
                        ref={input}
                        hidden
                        type="file"
                        accept=".csv,text/csv"
                        aria-label="Food catalog CSV"
                        onChange={event => {
                            const file = event.currentTarget.files?.[0]
                            if (file) void importFile(file)
                        }}
                    />
                    {status && <Alert>{status}</Alert>}
                </Stack>
            </Modal>
        </>
    )
}
