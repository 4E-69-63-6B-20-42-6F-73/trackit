import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
    GoalsPageSkeleton,
    JournalPageSkeleton,
    NutritionSkeleton,
    TodayGoalsSkeleton,
} from './LoadingSkeletons'

const renderSkeleton = (node: React.ReactNode) =>
    render(<MantineProvider>{node}</MantineProvider>)

describe('LoadingSkeletons', () => {
    it('exposes page-shaped Journal and Goals loading states', () => {
        const { rerender } = renderSkeleton(<JournalPageSkeleton />)
        expect(screen.getByRole('status', { name: 'Loading journal' })).toBeInTheDocument()

        rerender(
            <MantineProvider>
                <GoalsPageSkeleton />
            </MantineProvider>,
        )
        expect(screen.getByRole('status', { name: 'Loading goals page' })).toBeInTheDocument()
    })

    it('exposes Today section loading states without empty-state copy', () => {
        const { rerender } = renderSkeleton(<TodayGoalsSkeleton />)
        expect(screen.getByRole('status', { name: 'Loading daily goals' })).toBeInTheDocument()
        expect(screen.queryByText('No daily goals active')).not.toBeInTheDocument()

        rerender(
            <MantineProvider>
                <NutritionSkeleton />
            </MantineProvider>,
        )
        expect(screen.getByRole('status', { name: 'Loading daily nutrition' })).toBeInTheDocument()
    })
})
