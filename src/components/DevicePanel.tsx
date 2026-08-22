import { Alert, Button, Code, Group, Stack, Text } from '@mantine/core'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    confirmDevice,
    createPairingCode,
    listDevices,
    revokeDevice,
    type DeviceRecord,
} from '../lib/deviceApi'

export type DevicePairingStep = 'scanning' | 'confirmed'

export function DevicePanel() {
    const [devices, setDevices] = useState<DeviceRecord[]>([])
    const [pairing, setPairing] = useState<{
        code: string
        expiresAt: string
        serverIdentity: string
    } | null>(null)
    const [error, setError] = useState('')
    const [pollingActive, setPollingActive] = useState(false)
    const [showPendingName, setShowPendingName] = useState(false)
    const [currentStep, setCurrentStep] = useState<DevicePairingStep>('scanning')
    const [devicesCount, setDevicesCount] = useState(0)
    const pollingRef = useRef<number | null>(null)
    const prevPendingCountRef = useRef<number>(0)
    const pendingDeviceIdRef = useRef<string | null>(null)
    const pollingActiveRef = useRef(false)

    const refresh = useCallback(
        () =>
            listDevices()
                .then(devices => {
                    setDevices(devices)
                    setDevicesCount(devices.length)
                })
                .catch(() => setError('Devices unavailable.')),
        [],
    )

    useEffect(() => {
        void refresh()
    }, [refresh])

    // Start polling when a pairing code is active
    useEffect(() => {
        if (pairing && !pollingActiveRef.current) {
            pollingActiveRef.current = true
            setPollingActive(true)
            prevPendingCountRef.current = devices.filter(d => d.status === 'pending').length
            pendingDeviceIdRef.current = null
            pollingRef.current = setInterval(() => {
                refresh().then(() => {
                    const currentPendingDevices = devices.filter(d => d.status === 'pending')
                    const currentPendingCount = currentPendingDevices.length
                    const newPendingId = currentPendingDevices[0]?.id
                    if (currentPendingCount > prevPendingCountRef.current) {
                        prevPendingCountRef.current = currentPendingCount
                        pendingDeviceIdRef.current = newPendingId
                        setShowPendingName(true)
                        setCurrentStep('scanning')
                    } else if (newPendingId && pendingDeviceIdRef.current !== newPendingId) {
                        // New pending device detected
                        setShowPendingName(true)
                        setCurrentStep('scanning')
                        pendingDeviceIdRef.current = newPendingId
                    }
                })
            }, 1500) // Poll every 1.5 seconds
        }

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current)
                pollingRef.current = null
            }
            setPollingActive(false)
        }
    }, [pairing, pollingActive, devices, refresh])

    const create = async () => {
        try {
            setPairing(await createPairingCode())
            setError('')
            setCurrentStep('scanning')
        } catch {
            setError('A pairing code could not be generated.')
        }
    }

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
        }
        pollingActiveRef.current = false
        setPollingActive(false)
        setShowPendingName(false)
        setCurrentStep('scanning')
        setDevicesCount(0)
        pendingDeviceIdRef.current = null
    }, [])

    const confirm = async (id: string) => {
        try {
            await confirmDevice(id)
            await refresh()
            stopPolling()
            setShowPendingName(false)
            setCurrentStep('confirmed')
            setDevicesCount(prev => prev + 1)
            setError('')
        } catch {
            setError('The device could not be confirmed. The code may have expired.')
        }
    }

    const revoke = async (id: string) => {
        try {
            await revokeDevice(id)
            await refresh()
            stopPolling()
            setError('')
        } catch {
            setError('The device could not be revoked. Try again.')
        }
    }

    const calculateTimeRemaining = (expiresAt: string): string => {
        const now = new Date()
        const expires = new Date(expiresAt)
        const diffMs = expires.getTime() - now.getTime()
        const remainingMins = Math.floor(diffMs / 60000)
        const remainingSeconds = (diffMs % 60000) / 1000
        const mins = Math.min(remainingMins, 59)
        const secs = Math.min(remainingSeconds, 59)
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
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
            {pairing && (
                <Group align="flex-start" justify="space-between">
                    <Stack gap={2}>
                        <Text size="sm">
                            <Text fw={600}>Step 1: Scan device</Text>
                            {' — Open the QR code on your Android device and follow the pairing instructions.'}
                        </Text>
                        {currentStep === 'confirmed' && (
                            <Alert color="green" variant="light">
                                <Text>
                                    <Text fw={600}>Device paired successfully!</Text>
                                    {' Health Connect is now configured.'}
                                </Text>
                            </Alert>
                        )}
                    </Stack>
                    {currentStep === 'scanning' && (
                        <div>
                            <Button onClick={create} variant="default">
                                Generate new code
                            </Button>
                        </div>
                    )}
                </Group>
            )}
            
            {pairing && currentStep === 'scanning' && (
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
                        <Text size="xs" c="dimmed">
                            Expires in {calculateTimeRemaining(pairing.expiresAt)}
                        </Text>
                    </div>
                </Group>
            )}
            
            {error && <Alert color="orange">{error}</Alert>}
            
            {showPendingName && currentStep === 'scanning' && (
                <Alert color="teal" variant="light" mt="sm">
                    <Text>
                        <Text fw={600} size="sm">
                            New device detected
                        </Text>
                        {' — scanning for pending pairing requests...'}
                    </Text>
                </Alert>
            )}
            
            {devices.length > 0 && (
                <Stack gap={4}>
                    <Text size="xs" c="dimmed" fw={500}>
                        PAIRED DEVICES
                    </Text>
                    {devices.map(device => (
                        <Group
                            key={device.id}
                            justify="space-between"
                            wrap="nowrap"
                            align="flex-start"
                        >
                            <div>
                                <Text fw={600} size="sm">
                                    {device.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {device.status} ·{' '}
                                    {device.status === 'active' ? (
                                        <Text c="green">✓ Health Connect configured</Text>
                                    ) : (
                                        <>
                                            last seen{' '}
                                            {device.lastSeenAt
                                                ? new Date(device.lastSeenAt).toLocaleString()
                                                : 'never'}
                                        </>
                                    )}
                                </Text>
                                {device.sync.length > 0 && (
                                    <Stack gap={2} mt="xs">
                                        {device.sync.map(cursor => (
                                            <Text key={cursor.recordType} size="xs">
                                                {cursor.recordType.replace('Record', '')}:{' '}
                                                {cursor.status}
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
                                    Confirm device
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
            )}
        </Stack>
    )
}
