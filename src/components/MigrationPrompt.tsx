import { Button, Group, Modal, Stack, Text } from '@mantine/core'

export function MigrationPrompt({
    opened,
    count,
    migrate,
    close,
}: {
    opened: boolean
    count: number
    migrate: () => Promise<void>
    close: () => void
}) {
    return (
        <Modal
            opened={opened}
            onClose={close}
            title="Move browser records to your server?"
            centered
        >
            <Stack>
                <Text size="sm">
                    TrackIt found {count} local {count === 1 ? 'record' : 'records'}. Review the
                    count, then copy them to PostgreSQL. Browser data is only cleared after every
                    record is confirmed by the server.
                </Text>
                <Group justify="flex-end">
                    <Button variant="subtle" color="gray" onClick={close}>
                        Not now
                    </Button>
                    <Button onClick={() => void migrate()}>Import {count} records</Button>
                </Group>
            </Stack>
        </Modal>
    )
}
