import { Alert, Button, Group, Text } from '@mantine/core'

export function SyncStatus({ message, retry }: { message: string; retry: () => void }) {
    return (
        <Alert color="orange" title="Not saved to the server">
            <Group justify="space-between" align="center">
                <Text size="sm">{message}</Text>
                <Button size="xs" variant="default" onClick={retry}>
                    Retry
                </Button>
            </Group>
        </Alert>
    )
}
