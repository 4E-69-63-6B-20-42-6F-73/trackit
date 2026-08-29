import { MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ServerDataProvider } from '../hooks/useServerData'
import { JournalEventList } from './JournalEventList'

const sleepEvent = {
    id: 'sleep-entry',
    definitionId: 'sleep',
    time: '07:10',
    category: 'Sleep' as const,
    title: 'Sleep session',
    detail: 'Sleep 7.5 hours · Deep 1.2 hours · Rem 1.6 hours',
    source: 'Health Connect · Garmin',
    observedAt: '2026-08-29T07:10:00.000Z',
    startedAt: '2026-08-28T23:40:00.000Z',
    endedAt: '2026-08-29T07:10:00.000Z',
    version: 1,
    detailView: {
        kind: 'sleep' as const,
        stages: [
            {
                type: 'light' as const,
                start: '2026-08-28T23:40:00.000Z',
                end: '2026-08-29T01:00:00.000Z',
            },
            {
                type: 'deep' as const,
                start: '2026-08-29T01:00:00.000Z',
                end: '2026-08-29T01:40:00.000Z',
            },
            {
                type: 'rem' as const,
                start: '2026-08-29T01:40:00.000Z',
                end: '2026-08-29T02:10:00.000Z',
            },
        ],
    },
}

const preferences = {
    displayName: 'Owner',
    timezone: 'UTC',
    locale: 'en',
    units: 'metric' as const,
}

describe('Journal entry details', () => {
    it('opens a detailed sleep view directly', async () => {
        render(
            <MemoryRouter>
                <MantineProvider>
                    <ServerDataProvider initialData={{ preferences }}>
                        <JournalEventList events={[sleepEvent]} roomy />
                    </ServerDataProvider>
                </MantineProvider>
            </MemoryRouter>,
        )

        await userEvent.click(screen.getByRole('button', { name: /sleep session/i }))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Sleep phases')).toBeInTheDocument()
        expect(within(dialog).getByText(/Deep · 40 min/)).toBeInTheDocument()
        expect(within(dialog).getByText('Health Connect · Garmin')).toBeInTheDocument()
        expect(
            within(dialog).queryByRole('button', { name: 'View detailed sleep' }),
        ).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('button', { name: 'Back to entry' })).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('button', { name: 'View trend' })).not.toBeInTheDocument()
    })
})
