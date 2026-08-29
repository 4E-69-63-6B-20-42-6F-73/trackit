import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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

describe('Journal entry details', () => {
    it('opens a general detail view and then a detailed sleep view', async () => {
        render(
            <MantineProvider>
                <JournalEventList events={[sleepEvent]} roomy />
            </MantineProvider>,
        )

        await userEvent.click(screen.getByRole('button', { name: /sleep session/i }))
        expect(
            screen.getByText('Sleep 7.5 hours · Deep 1.2 hours · Rem 1.6 hours'),
        ).toBeInTheDocument()
        expect(screen.getByText('Health Connect · Garmin')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'View detailed sleep' }))
        expect(screen.getByText('Sleep phases')).toBeInTheDocument()
        expect(screen.getByText(/Deep · 40 min/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Back to entry' })).toBeInTheDocument()
    })
})
