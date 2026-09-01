import { Alert, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconArrowLeft } from '@tabler/icons-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { confirmDevice, createPairingCode, listDevices, rejectDevice } from '../../../lib/deviceApi'
import { serverQueryKeys } from '../../../lib/serverQueries'

export type PairingUiState = 'showing_qr' | 'pending_approval' | 'approved' | 'expired' | 'error'

export function DeviceNew() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [now, setNow] = useState(() => Date.now())
    const initialCreateStartedRef = useRef(false)

    const createMutation = useMutation({
        mutationFn: createPairingCode,
    })
    const pairing = createMutation.data ?? null
    const expired = Boolean(pairing && now >= new Date(pairing.expiresAt).getTime())

    const devicesQuery = useQuery({
        queryKey: [...serverQueryKeys.devices, 'pairing'],
        queryFn: ({ signal }) => listDevices(signal),
        enabled: Boolean(pairing) && !expired,
        refetchInterval: query => {
            const pending = query.state.data?.some(device => device.status === 'pending')
            return pending ? false : 1500
        },
    })
    const pendingDevice = devicesQuery.data?.find(device => device.status === 'pending') ?? null

    const actionMutation = useMutation({
        mutationFn: async ({ action, id }: { action: 'approve' | 'reject'; id: string }) => {
            if (action === 'approve') await confirmDevice(id)
            else await rejectDevice(id)
            return action
        },
        onSuccess: async action => {
            await queryClient.invalidateQueries({ queryKey: serverQueryKeys.devices })
            if (action === 'reject') await devicesQuery.refetch()
        },
    })

    useEffect(() => {
        if (initialCreateStartedRef.current) return
        initialCreateStartedRef.current = true
        createMutation.mutate()
    }, [])

    useEffect(() => {
        if (!pairing || expired || (actionMutation.isSuccess && actionMutation.data === 'approve'))
            return
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [pairing, expired, actionMutation.isSuccess, actionMutation.data])

    const calculateTimeRemaining = (expiresAt: string) => {
        const diffMs = Math.max(0, new Date(expiresAt).getTime() - now)
        const minutes = Math.floor(diffMs / 60_000)
        const seconds = Math.floor((diffMs % 60_000) / 1000)
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }

    const pairingState: PairingUiState =
        createMutation.isError || actionMutation.isError
            ? 'error'
            : actionMutation.isSuccess && actionMutation.data === 'approve'
              ? 'approved'
              : expired
                ? 'expired'
                : pendingDevice
                  ? 'pending_approval'
                  : 'showing_qr'

    const error = createMutation.isError
        ? 'A pairing code could not be generated.'
        : actionMutation.isError
          ? actionMutation.variables?.action === 'approve'
              ? 'The device could not be approved. It may have already been confirmed.'
              : 'The device could not be rejected. Try again.'
          : devicesQuery.isError
            ? 'TrackIt could not check for a pending phone. Pairing status will retry automatically.'
            : ''

    const handleApprove = () => {
        if (!pendingDevice) return
        actionMutation.mutate({ action: 'approve', id: pendingDevice.id })
    }

    const handleReject = () => {
        if (!pendingDevice) return
        actionMutation.mutate({ action: 'reject', id: pendingDevice.id })
    }

    const handleShowNewCode = () => {
        actionMutation.reset()
        createMutation.reset()
        setNow(Date.now())
        createMutation.mutate()
    }

    const handleBackToDevices = () => navigate('/connections/devices')
    const stopPairing = () => navigate('/connections/devices')

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

            {createMutation.isPending && (
                <Card withBorder padding="lg" radius="md" mb="xl">
                    <Group justify="center" role="status" aria-label="Generating pairing code">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">
                            Generating pairing code…
                        </Text>
                    </Group>
                </Card>
            )}

            {pairingState !== 'error' && pairing && (
                <Stack gap="md" mb="xl">
                    {pairingState === 'showing_qr' && (
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
                                        loading={createMutation.isPending}
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
                                            Expires in {calculateTimeRemaining(pairing.expiresAt)}
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

                    {pairingState === 'expired' && (
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
                                    <Button
                                        variant="default"
                                        size="sm"
                                        loading={
                                            actionMutation.isPending &&
                                            actionMutation.variables?.action === 'reject'
                                        }
                                        disabled={actionMutation.isPending}
                                        onClick={handleReject}
                                    >
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

                                <Button
                                    onClick={handleApprove}
                                    color="trackit"
                                    size="lg"
                                    fullWidth
                                    loading={
                                        actionMutation.isPending &&
                                        actionMutation.variables?.action === 'approve'
                                    }
                                    disabled={actionMutation.isPending}
                                >
                                    Approve {pendingDevice.name}
                                </Button>

                                <Text size="xs" c="dimmed" ta="center">
                                    Server: {pairing.serverIdentity}
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
