import { useEffect, useState, type ReactNode } from 'react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import {
    Alert,
    Button,
    Center,
    Loader,
    Paper,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core'
import { environment } from '../app/env'

type AuthState = 'loading' | 'offline' | 'setup' | 'login' | 'recovery' | 'authenticated'

export function AuthGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>('loading')
    const [password, setPassword] = useState('')
    const [bootstrapSecret, setBootstrapSecret] = useState('')
    const [recoveryCode, setRecoveryCode] = useState('')
    const [error, setError] = useState('')
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])

    useEffect(() => {
        let active = true
        fetch(`${environment.VITE_API_URL}/api/auth/status`, { credentials: 'same-origin' })
            .then(async response => {
                if (!response.ok) throw new Error('unavailable')
                const status = (await response.json()) as {
                    configured: boolean
                    authenticated: boolean
                }
                if (active) {
                    setState(
                        status.authenticated
                            ? 'authenticated'
                            : status.configured
                              ? 'login'
                              : 'setup',
                    )
                }
            })
            .catch(() => {
                if (active) setState('offline')
            })
        return () => {
            active = false
        }
    }, [])

    const submit = async () => {
        setError('')
        const endpoint = state === 'setup' ? 'setup' : 'login'
        const response = await fetch(`${environment.VITE_API_URL}/api/auth/${endpoint}`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'content-type': 'application/json',
                ...(state === 'setup' ? { 'x-trackit-bootstrap-secret': bootstrapSecret } : {}),
            },
            body: JSON.stringify({ password }),
        })
        if (!response.ok) {
            setError(
                state === 'setup'
                    ? 'Check the setup secret and use a password of at least 12 characters.'
                    : 'That password is incorrect.',
            )
            return
        }
        if (state === 'setup') {
            const result = (await response.json()) as { recoveryCodes: string[] }
            setRecoveryCodes(result.recoveryCodes)
        } else {
            setState('authenticated')
        }
        setPassword('')
    }

    const csrfToken = () =>
        document.cookie
            .split('; ')
            .find(value => value.startsWith('trackit_csrf='))
            ?.split('=')[1]

    const registerPasskey = async () => {
        setError('')
        try {
            const optionsResponse = await fetch(
                `${environment.VITE_API_URL}/api/auth/passkey/register/options`,
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'x-csrf-token': csrfToken() ?? '' },
                },
            )
            const attempt = (await optionsResponse.json()) as {
                attemptId: string
                options: PublicKeyCredentialCreationOptionsJSON
            }
            const optionsJSON = attempt.options
            const response = await startRegistration({ optionsJSON })
            const verification = await fetch(
                `${environment.VITE_API_URL}/api/auth/passkey/register/verify`,
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'content-type': 'application/json',
                        'x-csrf-token': csrfToken() ?? '',
                    },
                    body: JSON.stringify({ attemptId: attempt.attemptId, response }),
                },
            )
            if (!verification.ok) throw new Error('verification_failed')
            setState('authenticated')
        } catch {
            setError('Passkey registration was cancelled or could not be verified.')
        }
    }

    const loginWithPasskey = async () => {
        setError('')
        try {
            const optionsResponse = await fetch(
                `${environment.VITE_API_URL}/api/auth/passkey/authenticate/options`,
                { method: 'POST', credentials: 'same-origin' },
            )
            const attempt = (await optionsResponse.json()) as {
                attemptId: string
                options: PublicKeyCredentialRequestOptionsJSON
            }
            const optionsJSON = attempt.options
            const response = await startAuthentication({ optionsJSON })
            const verification = await fetch(
                `${environment.VITE_API_URL}/api/auth/passkey/authenticate/verify`,
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ attemptId: attempt.attemptId, response }),
                },
            )
            if (!verification.ok) throw new Error('verification_failed')
            setState('authenticated')
        } catch {
            setError('Passkey sign-in was cancelled or could not be verified.')
        }
    }

    const recover = async () => {
        setError('')
        const response = await fetch(`${environment.VITE_API_URL}/api/auth/recover`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: recoveryCode.trim() }),
        })
        if (!response.ok) {
            setError('That recovery code is invalid or has already been used.')
            return
        }
        setRecoveryCode('')
        setState('authenticated')
    }

    if (state === 'authenticated') return children
    if (state === 'loading') {
        return (
            <Center mih="100vh">
                <Loader role="status" aria-label="Checking server" />
            </Center>
        )
    }

    if (state === 'offline') {
        return (
            <Center mih="100vh" p="md">
                <Paper withBorder shadow="sm" radius="lg" p="xl" maw={440} w="100%">
                    <Stack>
                        <Text className="date">SERVER UNAVAILABLE</Text>
                        <Title order={1}>TrackIt remains locked</Title>
                        <Alert color="orange">
                            The server could not verify your session. Your private health data has
                            not been loaded.
                        </Alert>
                        <Text size="sm" c="#555b56">
                            For the full application, start PostgreSQL and the API with{' '}
                            <code>docker compose up --build</code>, or run{' '}
                            <code>npm run dev:server</code> beside Vite.
                        </Text>
                        <Button onClick={() => window.location.reload()}>Try again</Button>
                        {import.meta.env.DEV && (
                            <Button variant="outline" onClick={() => setState('authenticated')}>
                                Open local demo mode
                            </Button>
                        )}
                    </Stack>
                </Paper>
            </Center>
        )
    }

    return (
        <Center mih="100vh" p="md">
            <Paper withBorder shadow="sm" radius="lg" p="xl" maw={440} w="100%">
                <Stack>
                    <Text className="date">PRIVATE BY DEFAULT</Text>
                    <Title order={1}>
                        {state === 'setup'
                            ? 'Set up TrackIt'
                            : state === 'recovery'
                              ? 'Use a recovery code'
                              : 'Welcome back'}
                    </Title>
                    <Text c="dimmed" size="sm">
                        {state === 'setup'
                            ? 'Create the owner password for this self-hosted installation.'
                            : 'Unlock your private health journal.'}
                    </Text>
                    {state === 'recovery' ? (
                        <>
                            <TextInput
                                label="One-time recovery code"
                                value={recoveryCode}
                                onChange={event => setRecoveryCode(event.currentTarget.value)}
                                autoComplete="off"
                            />
                            {error && <Alert color="red">{error}</Alert>}
                            <Button disabled={!recoveryCode.trim()} onClick={() => void recover()}>
                                Recover session
                            </Button>
                            <Button variant="subtle" onClick={() => setState('login')}>
                                Back to sign in
                            </Button>
                        </>
                    ) : recoveryCodes.length > 0 ? (
                        <>
                            <Alert color="teal" title="Save these recovery codes now">
                                Each code can only be used once. Store them separately from this
                                server.
                            </Alert>
                            <Paper bg="gray.0" p="md">
                                <code>{recoveryCodes.join('\n')}</code>
                            </Paper>
                            {error && <Alert color="red">{error}</Alert>}
                            <Button onClick={() => void registerPasskey()}>Create a passkey</Button>
                            <Button variant="subtle" onClick={() => setState('authenticated')}>
                                Skip for now
                            </Button>
                        </>
                    ) : (
                        <>
                            {state === 'login' && 'PublicKeyCredential' in window && (
                                <Button onClick={() => void loginWithPasskey()}>
                                    Sign in with a passkey
                                </Button>
                            )}
                            {state === 'login' && (
                                <Text size="xs" c="dimmed" ta="center">
                                    Or use an owner recovery method
                                </Text>
                            )}
                            <PasswordInput
                                label="Recovery password"
                                value={password}
                                onChange={event => setPassword(event.currentTarget.value)}
                                minLength={12}
                                autoComplete={
                                    state === 'setup' ? 'new-password' : 'current-password'
                                }
                            />
                            {state === 'setup' && (
                                <PasswordInput
                                    label="Owner setup secret"
                                    description="Shown by the deployment script and stored in the server .env file."
                                    value={bootstrapSecret}
                                    onChange={event =>
                                        setBootstrapSecret(event.currentTarget.value)
                                    }
                                    autoComplete="off"
                                />
                            )}
                            {error && <Alert color="red">{error}</Alert>}
                            <Button
                                disabled={state === 'setup' && !bootstrapSecret}
                                onClick={() => void submit()}
                            >
                                {state === 'setup' ? 'Create owner account' : 'Sign in'}
                            </Button>
                            {state === 'login' && (
                                <Button variant="subtle" onClick={() => setState('recovery')}>
                                    Use a recovery code
                                </Button>
                            )}
                        </>
                    )}
                </Stack>
            </Paper>
        </Center>
    )
}
