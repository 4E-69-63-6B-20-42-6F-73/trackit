import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { useCallback, useEffect, useState } from 'react'
import { createBackup, listBackups, verifyBackup, type BackupRecord } from '../lib/lifecycleApi'

export function BackupPanel() {
    const [backups, setBackups] = useState<BackupRecord[]>([])
    const [configured, setConfigured] = useState(false)
    const [message, setMessage] = useState('')
    const latest = backups[0]
    const lastVerified = backups.find(backup => backup.verifiedAt)

    const refresh = useCallback(() => {
        void listBackups()
            .then(result => {
                setConfigured(result.configured)
                setBackups(result.data)
            })
            .catch(() => setMessage('Backup status is unavailable.'))
    }, [])

    useEffect(refresh, [refresh])

    const create = async () => {
        try {
            await createBackup()
            setMessage('Encrypted backup completed.')
            refresh()
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Backup failed.')
        }
    }

    const verify = async (filename: string) => {
        try {
            await verifyBackup(filename)
            setMessage('Archive decrypted and pg_restore verified its contents.')
            refresh()
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Verification failed.')
        }
    }

    return (
        <Stack>
            <section className="backup-summary" aria-label="Backup readiness">
                <Group justify="space-between">
                    <Text fw={700}>Encryption readiness</Text>
                    <Text size="sm" c={configured ? 'teal' : 'orange'} fw={600}>
                        {configured ? 'Ready' : 'Not configured'}
                    </Text>
                </Group>
                <Text size="sm" c="dimmed">
                    Last backup: {latest ? new Date(latest.createdAt).toLocaleString() : 'Never'}
                </Text>
                <Text size="sm" c="dimmed">
                    Last verified:{' '}
                    {lastVerified?.verifiedAt
                        ? new Date(lastVerified.verifiedAt).toLocaleString()
                        : 'Never'}
                </Text>
                <Text size="sm" c="dimmed">
                    Latest size:{' '}
                    {latest?.sizeBytes == null
                        ? 'Unknown'
                        : `${(latest.sizeBytes / 1024 / 1024).toFixed(1)} MB`}
                </Text>
                <Text size="sm" c="dimmed">
                    Destination and archive retention are controlled by the server installation.
                </Text>
            </section>
            {!configured && (
                <Alert color="orange" title="Backup key required">
                    Set TRACKIT_BACKUP_KEY to 32 random bytes encoded as base64 and enable scheduled
                    backups. The key must be stored separately from the archives.
                </Alert>
            )}
            <Button disabled={!configured} onClick={() => void create()}>
                Create encrypted backup now
            </Button>
            {message && <Alert>{message}</Alert>}
            {configured && backups.length === 0 && (
                <Text size="sm" c="dimmed">
                    No restore points have been created yet.
                </Text>
            )}
            {backups.map(backup => (
                <Group key={backup.id} justify="space-between" wrap="nowrap">
                    <div>
                        <Text size="sm" fw={600}>
                            {backup.filename}
                        </Text>
                        <Text size="xs" c={backup.status === 'failed' ? 'red' : 'dimmed'}>
                            {backup.status} · {backup.sizeBytes ?? 0} bytes · verified{' '}
                            {backup.verifiedAt
                                ? new Date(backup.verifiedAt).toLocaleString()
                                : 'never'}
                        </Text>
                        {backup.diagnostic && (
                            <Text size="xs" c={backup.status === 'failed' ? 'red' : 'dimmed'}>
                                {backup.diagnostic}
                            </Text>
                        )}
                    </div>
                    <Button
                        size="xs"
                        variant="default"
                        disabled={backup.status !== 'complete'}
                        onClick={() => void verify(backup.filename)}
                    >
                        Verify
                    </Button>
                </Group>
            ))}
        </Stack>
    )
}
