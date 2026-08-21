import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Divider, Group, Stack, Text } from '@mantine/core'
import { authRequest } from '../lib/authApi'

type Session = {
    id: string
    userAgent: string | null
    ipAddress: string | null
    createdAt: string
    expiresAt: string
}

type AuditEvent = {
    id: string
    action: string
    createdAt: string
}

export function SecurityPanel() {
    const [sessions, setSessions] = useState<Session[]>([])
    const [events, setEvents] = useState<AuditEvent[]>([])
    const [unavailable, setUnavailable] = useState(false)
    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState(false)

    const load = () =>
        Promise.all([authRequest('/api/auth/sessions'), authRequest('/api/auth/audit')])
            .then(async ([sessionResponse, auditResponse]) => {
                if (!sessionResponse.ok || !auditResponse.ok) throw new Error('unavailable')
                setSessions(((await sessionResponse.json()) as { data: Session[] }).data)
                setEvents(((await auditResponse.json()) as { data: AuditEvent[] }).data)
            })
            .catch(() => setUnavailable(true))

    useEffect(() => {
        void load()
    }, [])

    const revoke = async (id: string) => {
        setBusy(true)
        try {
            const response = await authRequest(`/api/auth/sessions/${id}`, { method: 'DELETE' })
            if (!response.ok) throw new Error('rejected')
            setSessions(current => current.filter(session => session.id !== id))
            setMessage('The session was revoked.')
        } catch {
            setMessage('The session could not be revoked. Try again.')
        } finally {
            setBusy(false)
        }
    }

    const revokeAll = async () => {
        setBusy(true)
        try {
            const response = await authRequest('/api/auth/logout-all', { method: 'POST' })
            if (!response.ok) throw new Error('rejected')
            window.location.reload()
        } catch {
            setMessage('Sessions could not be revoked. Try again.')
            setBusy(false)
        }
    }

    if (unavailable) {
        return <Text c="dimmed">Session management is available when connected to the server.</Text>
    }

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
                        loading={busy}
                        disabled={sessions.length === 0}
                        onClick={() => void revokeAll()}
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
                            {session.userAgent || 'Unknown device'}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {session.ipAddress || 'Unknown address'} ·{' '}
                            {new Date(session.createdAt).toLocaleString()}
                        </Text>
                    </div>
                    <Button
                        size="xs"
                        variant="default"
                        disabled={busy}
                        onClick={() => void revoke(session.id)}
                    >
                        Revoke
                    </Button>
                </Group>
            ))}
            <Divider />
            <Text fw={650}>Recent security activity</Text>
            {events.length === 0 && (
                <Text size="sm" c="dimmed">
                    Security events such as sign-ins and revoked sessions will appear here.
                </Text>
            )}
            {events.slice(0, 8).map(event => (
                <Group key={event.id} justify="space-between">
                    <Text size="sm">{event.action.replaceAll('.', ' ')}</Text>
                    <Text size="xs" c="dimmed">
                        {new Date(event.createdAt).toLocaleString()}
                    </Text>
                </Group>
            ))}
        </Stack>
    )
}
