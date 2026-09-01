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
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { environment } from '../app/env'
import { serverQueryKeys } from '../lib/serverQueries'

type AuthState = 'loading' | 'offline' | 'setup' | 'login' | 'recovery' | 'authenticated'
type AuthOverride = Extract<AuthState, 'login' | 'recovery' | 'authenticated'> | null

type AuthStatus = {
    configured: boolean
    authenticated: boolean
}

const loadAuthStatus = async (signal: AbortSignal): Promise<AuthStatus> => {
    const response = await fetch(`${environment.VITE_API_URL}/api/auth/status`, {
        credentials: 'same-origin',
        signal,
    })
    if (!response.ok) throw new Error('unavailable')
    return (await response.json()) as AuthStatus
}

export function AuthGate({ children }: { children: ReactNode }) {
    const statusQuery = useQuery({
        queryKey: serverQueryKeys.authStatus,
        queryFn: ({ signal }) => loadAuthStatus(signal),
        retry: 1,
    })
    const [overrideState, setOverrideState] = useState<AuthOverride>(null)
    const [password, setPassword] = useState('')
    const [bootstrapSecret, setBootstrapSecret] = useState('')
    const [recoveryCode, setRecoveryCode] = useState('')
    const state: AuthState = overrideState
        ? overrideState
        : statusQuery.isPending
          ? 'loading'
          : statusQuery.isError
            ? 'offline'
            : statusQuery.data.authenticated
              ? 'authenticated'
              : statusQuery.data.configured
                ? 'login'
                : 'setup'

    const submitMutation = useMutation({
        mutationFn: async () => {
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
                throw new Error(
                    state === 'setup'
                        ? 'Check the setup secret and use a password of at least 12 characters.'
                        : 'That password is incorrect.',
                )
            }
            return state === 'setup'
                ? ((await response.json()) as { recoveryCodes: string[] })
                : null
        },
        onSuccess: result => {
            if (!result) setOverrideState('authenticated')
            setPassword('')
        },
    })

    const csrfToken = () =>
        document.cookie
            .split('; ')
            .find(value => value.startsWith('trackit_csrf='))
            ?.split('=')[1]

    const registerPasskeyMutation = useMutation({
        mutationFn: async () => {
            const optionsResponse = await fetch(
                `${environment.VITE_API_URL}/api/auth/passkey/register/options`,
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'x-csrf-token': csrfToken() ?? '' },
                },
            )
            if (!optionsResponse.ok) throw new Error('options_failed')
            const attempt = (await optionsResponse.json()) as {
                attemptId: string
                options: PublicKeyCredentialCreationOptionsJSON
            }
            const response = await startRegistration({ optionsJSON: attempt.options })
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
        },
        onSuccess: () => setOverrideState('authenticated'),
    })

    const loginWithPasskeyMutation = useMutation({
        mutationFn: async () => {
            const optionsResponse = await fetch(
                `${environment.VITE_API_URL}/api/auth/passkey/authenticate/options`,
                { method: 'POST', credentials: 'same-origin' },
            )
            if (!optionsResponse.ok) throw new Error('options_failed')
            const attempt = (await optionsResponse.json()) as {
                attemptId: string
                options: PublicKeyCredentialRequestOptionsJSON
            }
            const response = await startAuthentication({ optionsJSON: attempt.options })
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
        },
        onSuccess: () => setOverrideState('authenticated'),
    })

    const recoveryMutation = useMutation({
        mutationFn: async () => {
            const response = await fetch(`${environment.VITE_API_URL}/api/auth/recover`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ code: recoveryCode.trim() }),
            })
            if (!response.ok)
                throw new Error('That recovery code is invalid or has already been used.')
        },
        onSuccess: () => {
            setRecoveryCode('')
            setOverrideState('authenticated')
        },
    })

    const recoveryCodes = submitMutation.data?.recoveryCodes ?? []
    const submitError = submitMutation.isError
        ? submitMutation.error instanceof Error
            ? submitMutation.error.message
            : 'Sign-in failed.'
        : ''
    const loginError =
        loginWithPasskeyMutation.submittedAt > submitMutation.submittedAt
            ? loginWithPasskeyMutation.isError
                ? 'Passkey sign-in was cancelled or could not be verified.'
                : ''
            : submitError
    const registrationError = registerPasskeyMutation.isError
        ? 'Passkey registration was cancelled or could not be verified.'
        : ''
    const recoveryError = recoveryMutation.isError
        ? recoveryMutation.error instanceof Error
            ? recoveryMutation.error.message
            : 'That recovery code could not be used.'
        : ''

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
                        <Button
                            loading={statusQuery.isFetching}
                            onClick={() => void statusQuery.refetch()}
                        >
                            Try again
                        </Button>
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
                            {recoveryError && <Alert color="red">{recoveryError}</Alert>}
                            <Button
                                loading={recoveryMutation.isPending}
                                disabled={!recoveryCode.trim()}
                                onClick={() => recoveryMutation.mutate()}
                            >
                                Recover session
                            </Button>
                            <Button variant="subtle" onClick={() => setOverrideState('login')}>
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
                            {registrationError && <Alert color="red">{registrationError}</Alert>}
                            <Button
                                loading={registerPasskeyMutation.isPending}
                                onClick={() => registerPasskeyMutation.mutate()}
                            >
                                Create a passkey
                            </Button>
                            <Button
                                variant="subtle"
                                onClick={() => setOverrideState('authenticated')}
                            >
                                Skip for now
                            </Button>
                        </>
                    ) : (
                        <>
                            {state === 'login' && 'PublicKeyCredential' in window && (
                                <Button
                                    loading={loginWithPasskeyMutation.isPending}
                                    onClick={() => loginWithPasskeyMutation.mutate()}
                                >
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
                            {(state === 'setup' ? submitError : loginError) && (
                                <Alert color="red">
                                    {state === 'setup' ? submitError : loginError}
                                </Alert>
                            )}
                            <Button
                                loading={submitMutation.isPending}
                                disabled={state === 'setup' && !bootstrapSecret}
                                onClick={() => submitMutation.mutate()}
                            >
                                {state === 'setup' ? 'Create owner account' : 'Sign in'}
                            </Button>
                            {state === 'login' && (
                                <Button
                                    variant="subtle"
                                    onClick={() => setOverrideState('recovery')}
                                >
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
