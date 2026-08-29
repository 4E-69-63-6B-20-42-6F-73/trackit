import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PreferencesPanel } from './PreferencesPanel'
import { getPreferences, updatePreferences } from '../lib/preferencesApi'
import { ServerDataProvider } from '../hooks/useServerData'

vi.mock('../lib/preferencesApi', () => ({
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
}))

describe('PreferencesPanel', () => {
    it('loads and persists owner profile preferences', async () => {
        const preferences = {
            displayName: 'Owner',
            timezone: 'UTC',
            locale: 'en',
            units: 'metric' as const,
        }
        vi.mocked(getPreferences).mockResolvedValue(preferences)
        vi.mocked(updatePreferences).mockImplementation(async value => ({
            ...preferences,
            ...value,
        }))
        render(
            <MantineProvider>
                <ServerDataProvider initialData={{ preferences }}>
                    <PreferencesPanel />
                </ServerDataProvider>
            </MantineProvider>,
        )
        const user = userEvent.setup()
        const name = await screen.findByLabelText(/Display name/)
        await user.clear(name)
        await user.type(name, 'Alex')
        await user.click(screen.getByRole('button', { name: 'Save changes' }))
        expect(updatePreferences).toHaveBeenCalledWith({
            displayName: 'Alex',
            timezone: 'UTC',
            locale: 'en',
        })
        expect(await screen.findByText('Preferences saved.')).toBeInTheDocument()
    })
})
