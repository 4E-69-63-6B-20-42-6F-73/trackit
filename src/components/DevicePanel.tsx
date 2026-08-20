import { Alert, Button, Code, Group, Stack, Text } from '@mantine/core'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useState } from 'react'
import {
    confirmDevice,
    createPairingCode,
    listDevices,
    revokeDevice,
    type DeviceRecord,
} from '../lib/deviceApi'

export function DevicePanel() {
    const [devices, setDevices] = useState<DeviceRecord[]>([])
    const [pairing, setPairing] = useState<{
        code: string
        expiresAt: string
        serverIdentity: string
    } | null>(null)
    const [error, setError] = useState('')

    const refresh = useCallback(
        () =>
            listDevices()
                .then(setDevices)
                .catch(() => setError('Devices unavailable.')),
        [],
    )

    useEffect(() => {
        void refresh()
    }, [refresh])

    const create = async () => {
        try {
            setPairing(await createPairingCode())
            setError('')
        } catch {
            setError('A pairing code could not be generated.')
        }
    }

    const confirm = async (id: string) => {
        try {
            await confirmDevice(id)
            await refresh()
            setError('')
        } catch {
            setError('The device could not be confirmed. The code may have expired.')
        }
    }

    const revoke = async (id: string) => {
        try {
            await revokeDevice(id)
            await refresh()
            setError('')
        } catch {
            setError('The device could not be revoked. Try again.')
        }
    }

    const qrValue = pairing
        ? JSON.stringify({
              serverUrl: window.location.origin,
              serverIdentity: pairing.serverIdentity,
              code: pairing.code,
              expiresAt: pairing.expiresAt,
          })
        : ''

    return (
        <Stack>
            <Text size="sm">
                Pairing requires confirmation here and on the Android device. Codes expire after
                five minutes and can only be used once.
            </Text>
            <Button onClick={() => void create()}>Generate pairing code</Button>
            {pairing && (
                <Group align="flex-start">
                    <QRCodeSVG value={qrValue} size={152} aria-label="Android pairing QR code" />
                    <div>
                        <Text size="xs" c="dimmed">
                            Pairing code
                        </Text>
                        <Code fz="xl">{pairing.code}</Code>
                        <Text size="xs" mt="xs">
                            Verify server: {pairing.serverIdentity}
                        </Text>
                    </div>
                </Group>
            )}
            {error && <Alert color="orange">{error}</Alert>}
            {devices.map(device => (
                <Group key={device.id} justify="space-between" wrap="nowrap" align="flex-start">
                    <div>
                        <Text fw={600} size="sm">
                            {device.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {device.status} · last seen{' '}
                            {device.lastSeenAt
                                ? new Date(device.lastSeenAt).toLocaleString()
                                : 'never'}
                        </Text>
                        {device.sync.length > 0 && (
                            <Stack gap={2} mt="xs">
                                {device.sync.map(cursor => (
                                    <Text key={cursor.recordType} size="xs">
                                        {cursor.recordType.replace('Record', '')}: {cursor.status}
                                        {cursor.lastSyncedAt
                                            ? ` · ${new Date(cursor.lastSyncedAt).toLocaleString()}`
                                            : ''}
                                        {cursor.diagnostic ? ` · ${cursor.diagnostic}` : ''}
                                    </Text>
                                ))}
                            </Stack>
                        )}
                    </div>
                    {device.status === 'pending' ? (
                        <Button size="xs" onClick={() => void confirm(device.id)}>
                            Confirm
                        </Button>
                    ) : (
                        <Button
                            size="xs"
                            variant="default"
                            disabled={device.status === 'revoked'}
                            onClick={() => void revoke(device.id)}
                        >
                            {device.status === 'revoked' ? 'Revoked' : 'Revoke'}
                        </Button>
                    )}
                </Group>
            ))}
        </Stack>
    )
}
