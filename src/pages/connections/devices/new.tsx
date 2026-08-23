import { Alert, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    confirmDevice,
    createPairingCode,
    listDevices,
    rejectDevice,
    type DeviceRecord,
} from '../../../lib/deviceApi'
import { IconArrowLeft } from '@tabler/icons-react'

export type PairingUiState = 'showing_qr' | 'pending_approval' | 'approved' | 'expired' | 'error'

export function DeviceNew() {
    const navigate = useNavigate()
    const [pairingState, setPairingState] = useState<PairingUiState>('showing_qr')
    const [pairing, setPairing] = useState<{
        code: string
        expiresAt: string
        serverIdentity: string
    } | null>(null)
    const [pendingDevice, setPendingDevice] = useState<DeviceRecord | null>(null)
    const [error, setError] = useState('')
    const [timeRemaining, setTimeRemaining] = useState<string>('05:00')
    const pollingRef = useRef<number | null>(null)
    const countdownRef = useRef<number | null>(null)
    const pollingActiveRef = useRef(false)
    const lastProcessedPendingIdRef = useRef<string | null>(null)
    const initialCreateStartedRef = useRef(false)

    const calculateTimeRemaining = useCallback((expiresAt: string): string => {
        const now = new Date()
        const expires = new Date(expiresAt)
        const diffMs = expires.getTime() - now.getTime()
        const remainingMins = Math.floor(diffMs / 60000)
        const remainingSeconds = Math.floor((diffMs % 60000) / 1000)
        const mins = Math.max(0, Math.min(remainingMins, 59))
        const secs = Math.max(0, Math.min(remainingSeconds, 59))
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }, [])

    const isPairingExpired = useCallback((expiresAt: string): boolean => {
        return new Date().getTime() >= new Date(expiresAt).getTime()
    }, [])

    const handlePairingError = useCallback((message: string) => {
        setError(message)
        setPairingState('error')
    }, [])

    const create = useCallback(async () => {
        try {
            const newPairing = await createPairingCode()
            setPairing(newPairing)
            setPendingDevice(null)
            setError('')
            setPairingState('showing_qr')
            setTimeRemaining(calculateTimeRemaining(newPairing.expiresAt))
        } catch {
            handlePairingError('A pairing code could not be generated.')
        }
    }, [calculateTimeRemaining, handlePairingError])

    const startPolling = useCallback(
        async (currentPairing: { code: string; expiresAt: string; serverIdentity: string }) => {
            if (pollingActiveRef.current) return

            pollingActiveRef.current = true
            lastProcessedPendingIdRef.current = null

            const fetchDevices = async () => {
                try {
                    const pendingDevices = await listDevices()
                    const currentPendingDevice =
                        pendingDevices.find(d => d.status === 'pending') || null

                    if (currentPendingDevice) {
                        if (
                            lastProcessedPendingIdRef.current !== currentPendingDevice.id &&
                            !isPairingExpired(currentPairing.expiresAt)
                        ) {
                            lastProcessedPendingIdRef.current = currentPendingDevice.id
                            setPendingDevice(currentPendingDevice)
                            setPairingState('pending_approval')
                        }
                    } else {
                        setPendingDevice(null)
                    }
                } catch {
                    // Silently handle errors during polling
                }
            }

            await fetchDevices()

            // fetchDevices can change pairingState, which causes the polling
            // effect cleanup to run while this async function is awaiting.
            if (!pollingActiveRef.current) return

            pollingRef.current = window.setInterval(fetchDevices, 1500)
        },
        [isPairingExpired],
    )

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            window.clearInterval(pollingRef.current)
            pollingRef.current = null
        }
        pollingActiveRef.current = false
    }, [])

    // Create the first pairing code when the page opens. The ref prevents
    // React StrictMode's development effect replay from creating two codes.
    useEffect(() => {
        if (initialCreateStartedRef.current) return

        initialCreateStartedRef.current = true
        void create()
    }, [create])

    // Start polling while the QR code is waiting for a device. Including
    // pairingState ensures polling restarts after a rejected device.
    useEffect(() => {
        if (pairing && pairingState === 'showing_qr') {
            void startPolling(pairing)
        }

        return () => {
            stopPolling()
        }
    }, [pairing, pairingState, startPolling, stopPolling])

    // Keep the countdown active only while pairing is still in progress.
    useEffect(() => {
        if (!pairing || (pairingState !== 'showing_qr' && pairingState !== 'pending_approval')) {
            return
        }

        const updateCountdown = () => {
            const timeStr = calculateTimeRemaining(pairing.expiresAt)
            setTimeRemaining(timeStr)

            if (isPairingExpired(pairing.expiresAt)) {
                stopPolling()
                setPairingState('expired')
            }
        }

        updateCountdown()
        countdownRef.current = window.setInterval(updateCountdown, 1000)

        return () => {
            if (countdownRef.current) {
                window.clearInterval(countdownRef.current)
                countdownRef.current = null
            }
        }
    }, [pairing, pairingState, calculateTimeRemaining, isPairingExpired, stopPolling])

    const handleApprove = async () => {
        if (!pendingDevice) return

        try {
            await confirmDevice(pendingDevice.id)
            stopPolling()
            setPendingDevice(null)
            setPairingState('approved')
            setError('')
        } catch {
            handlePairingError(
                'The device could not be approved. It may have already been confirmed.',
            )
        }
    }

    const handleReject = async () => {
        if (!pendingDevice) return

        try {
            await rejectDevice(pendingDevice.id)
            stopPolling()
            setPendingDevice(null)
            setPairingState('showing_qr')
            setError('')
        } catch {
            handlePairingError('The device could not be rejected. Try again.')
        }
    }

    const handleShowNewCode = useCallback(() => {
        stopPolling()
        setPairing(null)
        setPendingDevice(null)
        setPairingState('showing_qr')
        void create()
    }, [stopPolling, create])

    const handleBackToDevices = useCallback(() => {
        stopPolling()
        navigate('/connections/devices')
    }, [navigate, stopPolling])

    const stopPairing = useCallback(() => {
        stopPolling()
        setPairing(null)
        setPendingDevice(null)
        setError('')
        navigate('/connections/devices')
    }, [navigate, stopPolling])

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
                onClick={handleBackToDevices}
                mb="md"
            >
                Back to Devices
            </Button>

            <Title order={1} mb="sm">
                Connect an Android phone
            </Title>
            <Text c="dimmed" mb="xl">
                Connect your Android device to sync Health Connect data.
            </Text>

            {error && (
                <Alert color="orange" variant="light" mb="md">
                    {error}
                </Alert>
            )}

            {/* Active Pairing Flow */}
            {pairingState !== 'error' && (
                <Stack gap="md" mb="xl">
                    {pairingState === 'showing_qr' && pairing && (
                        <Card withBorder padding="lg" radius="md">
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Stack gap={2}>
                                        <Text size="sm" fw={500}>
                                            Scan this QR code
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            1. Open the TrackIt Android companion app
                                            <br />
                                            2. Tap Scan QR code
                                            <br />
                                            3. Scan the code shown below
                                        </Text>
                                    </Stack>
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={handleShowNewCode}
                                    >
                                        New code
                                    </Button>
                                </Group>

                                <Group align="flex-start" justify="center" gap="xl">
                                    <QRCodeSVG
                                        value={qrValue}
                                        size={180}
                                        aria-label="Android pairing QR code"
                                    />
                                    <Stack gap={4} align="center">
                                        <Text size="xs" c="dimmed">
                                            Pairing code
                                        </Text>
                                        <Text fz="xl" fw={600}>
                                            {pairing.code}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            Expires in {timeRemaining}
                                        </Text>
                                    </Stack>
                                </Group>

                                <Group justify="space-between" mt="sm">
                                    <Text size="xs" c="dimmed">
                                        Server: {pairing.serverIdentity}
                                    </Text>
                                    <Button variant="default" size="sm" onClick={stopPairing}>
                                        Stop pairing
                                    </Button>
                                </Group>
                            </Stack>
                        </Card>
                    )}

                    {pairingState === 'expired' && pairing && (
                        <Card withBorder padding="lg" radius="md">
                            <Stack gap="md" align="center">
                                <Text size="lg" fw={500}>
                                    This code expired
                                </Text>
                                <Text size="sm" c="dimmed" ta="center">
                                    The pairing code has expired. Generate a new code to continue.
                                </Text>
                                <Button onClick={handleShowNewCode} color="trackit">
                                    Show a new QR code
                                </Button>
                            </Stack>
                        </Card>
                    )}

                    {pairingState === 'pending_approval' && pendingDevice && (
                        <Card withBorder padding="lg" radius="md" color="blue">
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Text size="sm" fw={500}>
                                        Confirm this phone
                                    </Text>
                                    <Button variant="default" size="sm" onClick={handleReject}>
                                        Reject
                                    </Button>
                                </Group>

                                <Stack gap="sm">
                                    <Text size="md" fw={500}>
                                        {pendingDevice.name}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        This device wants to connect to your TrackIt server.
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        Approve only if this is the phone you just scanned with.
                                    </Text>
                                </Stack>

                                <Button onClick={handleApprove} color="trackit" size="lg" fullWidth>
                                    Approve {pendingDevice.name}
                                </Button>

                                <Text size="xs" c="dimmed" ta="center">
                                    Server: {pairing?.serverIdentity}
                                </Text>
                            </Stack>
                        </Card>
                    )}

                    {pairingState === 'approved' && (
                        <Card withBorder padding="lg" radius="md" color="green">
                            <Stack gap="md" align="center">
                                <Text size="lg" fw={500}>
                                    Phone connected
                                </Text>
                                <Text size="sm" c="dimmed" ta="center">
                                    Finish Health Connect setup on your Android phone.
                                </Text>
                                <Button onClick={handleBackToDevices} color="trackit">
                                    Done
                                </Button>
                            </Stack>
                        </Card>
                    )}
                </Stack>
            )}
        </div>
    )
}
