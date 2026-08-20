import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PreferencesPanel } from './PreferencesPanel'
import { getPreferences, updatePreferences } from '../lib/preferencesApi'

vi.mock('../lib/preferencesApi', () => ({
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
}))

describe('PreferencesPanel', () => {
    it('loads and persists owner preferences', async () => {
        vi.mocked(getPreferences).mockResolvedValue({
            displayName: 'Owner',
            timezone: 'UTC',
            locale: 'en',
            units: 'metric',
        })
        vi.mocked(updatePreferences).mockImplementation(async value => value)
        render(
            <MantineProvider>
                <PreferencesPanel />
            </MantineProvider>,
        )
        const user = userEvent.setup()
        const name = await screen.findByLabelText(/Display name/)
        await user.clear(name)
        await user.type(name, 'Alex')
        await user.click(screen.getByRole('button', { name: 'Save changes' }))
        expect(updatePreferences).toHaveBeenCalledWith(
            expect.objectContaining({ displayName: 'Alex', timezone: 'UTC', units: 'metric' }),
        )
        expect(await screen.findByText('Preferences saved.')).toBeInTheDocument()
    })
})
