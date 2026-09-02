import { Alert, Badge, Button, Divider, Group, Select, Skeleton, Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
    listAuthAudit,
    listAuthSessions,
    logoutAll,
    revokeAuthSession,
} from '../lib/authApi'
import { serverQueryKeys } from '../lib/serverQueries'

const deviceName = (agent: string | null) => {
    if (!agent) return 'Unknown browser and device'
    const browser = agent.includes('Edg/')
        ? 'Microsoft Edge'
        : agent.includes('Chrome/')
          ? 'Chrome'
          : agent.includes('Firefox/')
            ? 'Firefox'
            : agent.includes('Safari/')
              ? 'Safari'
              : 'Browser'
    const os = agent.includes('Windows')
        ? 'Windows'
        : agent.includes('Android')
          ? 'Android'
          : /iPhone|iPad/.test(agent)
            ? 'iOS'
            : agent.includes('Mac OS')
              ? 'macOS'
              : agent.includes('Linux')
                ? 'Linux'
                : 'unknown OS'
    return `${browser} on ${os}`
}
const actionLabel = (action: string) =>
    ({
        'auth.session_revoke': 'Session revoked',
        'data.record.deleted': 'Journal record deleted',
        'data.exported': 'Data export downloaded',
    })[action] ?? action.replaceAll('.', ' ').replace(/^./, letter => letter.toUpperCase())

export function SecurityPanel() {
    const queryClient = useQueryClient()
    const [auditFilter, setAuditFilter] = useState('all')
    const [visibleEvents, setVisibleEvents] = useState(10)
    const sessionsQuery = useQuery({
        queryKey: serverQueryKeys.securitySessions,
        queryFn: ({ signal }) => listAuthSessions(signal),
    })
    const auditQuery = useQuery({
        queryKey: serverQueryKeys.securityAudit,
        queryFn: ({ signal }) => listAuthAudit(signal),
    })
    const revokeMutation = useMutation({
        mutationFn: revokeAuthSession,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: serverQueryKeys.securitySessions }),
                queryClient.invalidateQueries({ queryKey: serverQueryKeys.securityAudit }),
            ])
        },
    })
    const revokeAllMutation = useMutation({
        mutationFn: logoutAll,
        onSuccess: () => window.location.reload(),
    })
    const sessions = sessionsQuery.data ?? []
    const events = auditQuery.data ?? []
    const unavailable = sessionsQuery.isError || auditQuery.isError
    const loading = sessionsQuery.isPending || auditQuery.isPending
    const busy = revokeMutation.isPending || revokeAllMutation.isPending
    const message = revokeMutation.isSuccess
        ? 'The session was revoked.'
        : revokeMutation.isError
          ? 'The session could not be revoked. Try again.'
          : revokeAllMutation.isError
            ? 'Sessions could not be revoked. Try again.'
            : ''

    const revoke = (id: string) => {
        revokeAllMutation.reset()
        revokeMutation.mutate(id)
    }
    const revokeAll = () => {
        revokeMutation.reset()
        revokeAllMutation.mutate()
    }

    if (unavailable) {
        return <Text c="dimmed">Session management is available when connected to the server.</Text>
    }
    if (loading) {
        return (
            <Stack>
                <Skeleton height={42} radius="md" />
                <Skeleton height={72} radius="md" />
                <Skeleton height={72} radius="md" />
            </Stack>
        )
    }
    const filteredEvents = events.filter(event => {
        if (auditFilter === 'all') return true
        if (auditFilter === 'authentication') return event.action.startsWith('auth.')
        if (auditFilter === 'data') return event.action.startsWith('data.')
        return true
    })

    return (
        <Stack>
            <Group justify="space-between">
                <Text fw={650}>Active sessions</Text>
                <Group gap="xs">
                    <Badge variant="light">{sessions.length}</Badge>
                    <Button
                        size="xs"
                        color="red"
                        variant="light"
                        loading={revokeAllMutation.isPending}
                        disabled={sessions.length === 0}
                        onClick={revokeAll}
                    >
                        Sign out all devices
                    </Button>
                </Group>
            </Group>
            {message && <Alert>{message}</Alert>}
            {sessions.length === 0 && (
                <Text size="sm" c="dimmed">
                    No active sessions are currently reported.
                </Text>
            )}
            {sessions.map(session => (
                <Group key={session.id} justify="space-between" wrap="nowrap">
                    <div>
                        <Text size="sm" fw={600} lineClamp={1}>
                            {deviceName(session.userAgent)}
                            {session.current && (
                                <Badge size="xs" variant="light" ml="xs">
                                    This device
                                </Badge>
                            )}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {session.ipAddress || 'Unknown address'} ·{' '}
                            {new Date(session.createdAt).toLocaleString()}
                            {' · expires '}
                            {new Date(session.expiresAt).toLocaleString()}
                        </Text>
                    </div>
                    <Button
                        size="xs"
                        variant="default"
                        disabled={busy || session.current}
                        loading={
                            revokeMutation.isPending && revokeMutation.variables === session.id
                        }
                        onClick={() => revoke(session.id)}
                    >
                        Revoke
                    </Button>
                </Group>
            ))}
            <Divider />
            <Group justify="space-between" align="end">
                <Text fw={650}>Recent security activity</Text>
                <Select
                    size="xs"
                    aria-label="Filter security activity"
                    value={auditFilter}
                    onChange={value => {
                        setAuditFilter(value ?? 'all')
                        setVisibleEvents(10)
                    }}
                    data={[
                        { value: 'all', label: 'All activity' },
                        { value: 'authentication', label: 'Sign-ins & sessions' },
                        { value: 'data', label: 'Data changes' },
                    ]}
                />
            </Group>
            {events.length === 0 && (
                <Text size="sm" c="dimmed">
                    Security events such as sign-ins and revoked sessions will appear here.
                </Text>
            )}
            {filteredEvents.slice(0, visibleEvents).map(event => (
                <Group key={event.id} justify="space-between">
                    <div>
                        <Text size="sm" fw={600}>
                            {actionLabel(event.action)}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {event.actor}
                            {event.targetType ? ` · ${event.targetType.replaceAll('_', ' ')}` : ''}
                            {event.targetId ? ` · ${event.targetId.slice(0, 8)}` : ''}
                        </Text>
                    </div>
                    <Text size="xs" c="dimmed">
                        {new Date(event.createdAt).toLocaleString()}
                    </Text>
                </Group>
            ))}
            {filteredEvents.length > visibleEvents && (
                <Button variant="default" onClick={() => setVisibleEvents(count => count + 10)}>
                    Show 10 more
                </Button>
            )}
            {filteredEvents.length > 0 && (
                <Text size="xs" c="dimmed">
                    Showing {Math.min(visibleEvents, filteredEvents.length)} of{' '}
                    {filteredEvents.length} matching events
                </Text>
            )}
        </Stack>
    )
}
