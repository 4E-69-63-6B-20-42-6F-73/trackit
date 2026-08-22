import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    confirmDevice,
    createPairingCode,
    listDevices,
    revokeDevice,
    type DeviceRecord,
} from '../lib/deviceApi'
import { IconArrowLeft, IconRefresh, IconQrcode, IconX } from '@tabler/icons-react'

export type DevicePairingStep = 'scanning' | 'confirmed'

export function DeviceManagement() {
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
    const [timeRemaining, setTimeRemaining] = useState<string>('05:00')
    const pollingRef = useRef<number | null>(null)
    const countdownRef = useRef<number | null>(null)
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
                        setShowPendingName(true)
                        setCurrentStep('scanning')
                        pendingDeviceIdRef.current = newPendingId
                    }
                })
            }, 1500)
        }

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current)
                pollingRef.current = null
            }
            setPollingActive(false)
        }
    }, [pairing, pollingActive, devices, refresh])

    // Start countdown timer when pairing is active
    useEffect(() => {
        if (pairing) {
            // Update immediately
            setTimeRemaining(calculateTimeRemaining(pairing.expiresAt))

            // Update every second
            countdownRef.current = window.setInterval(() => {
                setTimeRemaining(calculateTimeRemaining(pairing.expiresAt))
            }, 1000)
        }

        return () => {
            if (countdownRef.current) {
                window.clearInterval(countdownRef.current)
                countdownRef.current = null
            }
        }
    }, [pairing])

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
        setCurrentStep('confirmed')
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
        <div className="page-content device-management-page">
            <Button
                variant="subtle"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => window.history.back()}
                mb="md"
            >
                Back to Connections
            </Button>

            <Title order={1} mb="sm">
                Device Management
            </Title>
            <Text c="dimmed" mb="xl">
                Pair and manage your Android devices for Health Connect integration.
            </Text>

            {/* Pairing Section */}
            {!pairing ? (
                <Stack align="center" justify="center" miw={300} mx="auto" mb="xl">
                    <IconQrcode size={64} color="dimmed" />
                    <Text size="lg" fw={500}>
                        Start pairing a new device
                    </Text>
                    <Text size="sm" c="dimmed" ta="center">
                        Scan the QR code with your Android device to begin the pairing process.
                    </Text>
                    <Button onClick={create} size="lg" color="trackit">
                        Generate Pairing Code
                    </Button>
                </Stack>
            ) : (
                <Stack gap="md">
                    {/* Active Pairing */}
                    {currentStep === 'scanning' && (
                        <Card withBorder padding="lg" radius="md">
                            <Group justify="space-between">
                                <Stack gap={2}>
                                    <Text size="sm" fw={500}>
                                        Step 1: Scan device
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        Open the QR code on your Android device and follow the
                                        pairing instructions.
                                    </Text>
                                </Stack>
                                <Button onClick={create} variant="default" size="sm">
                                    New code
                                </Button>
                            </Group>
                            <Group align="flex-start" justify="center" gap="xl" mt="md">
                                <QRCodeSVG
                                    value={qrValue}
                                    size={180}
                                    aria-label="Android pairing QR code"
                                />
                                <Stack gap={4} align="center">
                                    <Text size="xs" c="dimmed">Pairing code</Text>
                                    <Text fz="xl" fw={600}>
                                        {pairing.code}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        Expires in {timeRemaining}
                                    </Text>
                                </Stack>
                            </Group>
                            {showPendingName && (
                                <Alert color="teal" variant="light" mt="sm">
                                    <Text size="sm">
                                        <Text fw={600}>New device detected</Text>
                                        {' — scanning for pending pairing requests...'}
                                    </Text>
                                </Alert>
                            )}
                        </Card>
                    )}

                    {currentStep === 'confirmed' && (
                        <Alert color="green" variant="light">
                            <Text>
                                <Text fw={600}>Device paired successfully!</Text>
                                {' Health Connect is now configured.'}
                            </Text>
                        </Alert>
                    )}

                    {error && <Alert color="orange" variant="light">{error}</Alert>}

                    {/* Devices List */}
                    {devices.length > 0 && (
                        <Card withBorder padding="lg" radius="md" mt="md">
                            <Group justify="space-between" mb="md">
                                <Text size="sm" fw={600}>
                                    Paired Devices
                                </Text>
                                <Button
                                    onClick={refresh}
                                    variant="subtle"
                                    size="xs"
                                    leftSection={<IconRefresh size={14} />}
                                    loading={pollingActive}
                                >
                                    Refresh
                                </Button>
                            </Group>
                            <Stack gap="sm">
                                {devices.map(device => (
                                    <div
                                        key={device.id}
                                        style={{
                                            background:
                                                device.status === 'active'
                                                    ? 'var(--mantine-color-green-0)'
                                                    : device.status === 'pending'
                                                      ? 'var(--mantine-color-blue-0)'
                                                      : 'var(--mantine-color-gray-0)',
                                            borderRadius: 'var(--mantine-radius-md)',
                                            padding: 'var(--mantine-spacing-sm)',
                                        }}
                                    >
                                        <Group
                                            justify="space-between"
                                            wrap="nowrap"
                                            align="flex-start"
                                        >
                                            <Stack gap={2} flex={1}>
                                                <Group gap="xs" align="center">
                                                    <Text fw={600} size="sm">
                                                        {device.name}
                                                    </Text>
                                                    <Badge
                                                        size="sm"
                                                        variant="light"
                                                        color={
                                                            device.status === 'active'
                                                                ? 'green'
                                                                : device.status === 'pending'
                                                                  ? 'blue'
                                                                  : device.status === 'confirmed'
                                                                    ? 'gray'
                                                                    : 'red'
                                                        }
                                                    >
                                                        {device.status}
                                                    </Badge>
                                                </Group>
                                                <Text size="xs" c="dimmed">
                                                    {device.status === 'active' ? (
                                                        <>
                                                            ✓ Health Connect configured ·{' '}
                                                            {device.lastSeenAt
                                                                ? `last seen ${new Date(device.lastSeenAt).toLocaleString()}`
                                                                : ''}
                                                        </>
                                                    ) : (
                                                        <>
                                                            {device.lastSeenAt
                                                                ? `last seen ${new Date(device.lastSeenAt).toLocaleString()}`
                                                                : 'last seen never'}
                                                        </>
                                                    )}
                                                </Text>
                                                {device.sync.length > 0 && (
                                                    <Stack gap={1}>
                                                        {device.sync.map(cursor => (
                                                            <Text key={cursor.recordType} size="xs">
                                                                {cursor.recordType.replace('Record', '')}:{' '}
                                                                {cursor.status}
                                                                {cursor.lastSyncedAt
                                                                    ? ` · ${new Date(cursor.lastSyncedAt).toLocaleString()}`
                                                                    : ''}
                                                                {cursor.diagnostic
                                                                    ? ` · ${cursor.diagnostic}`
                                                                    : ''}
                                                            </Text>
                                                        ))}
                                                    </Stack>
                                                )}
                                            </Stack>
                                            <Button
                                                size="compact-sm"
                                                variant={
                                                    device.status === 'pending'
                                                        ? 'filled'
                                                        : 'default'
                                                }
                                                color={
                                                    device.status === 'pending'
                                                        ? 'trackit'
                                                        : 'red'
                                                }
                                                onClick={() =>
                                                    device.status === 'pending'
                                                        ? void confirm(device.id)
                                                        : void revoke(device.id)
                                                }
                                                disabled={device.status !== 'pending' && pollingActive}
                                            >
                                                {device.status === 'pending'
                                                    ? 'Confirm'
                                                    : device.status === 'revoked'
                                                      ? 'Revoked'
                                                      : 'Revoke'}
                                            </Button>
                                        </Group>
                                    </div>
                                ))}
                            </Stack>
                        </Card>
                    )}

                    {/* Actions */}
                    <Group justify="space-between" mt="md">
                        <Button
                            variant="default"
                            onClick={() => {
                                setPairing(null)
                                stopPolling()
                            }}
                        >
                            Cancel Pairing
                        </Button>
                        {pairing && (
                            <Text size="xs" c="dimmed">
                                Server: {pairing.serverIdentity}
                            </Text>
                        )}
                    </Group>
                </Stack>
            )}
        </div>
    )
}
