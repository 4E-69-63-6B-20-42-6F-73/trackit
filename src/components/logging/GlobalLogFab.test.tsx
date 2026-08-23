import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LoggingProvider, useLogger } from '../../logging/LoggingContext'
import { logActions } from '../../logging/logActions'
import { GlobalLogFab } from './GlobalLogFab'

function ActiveLoggerProbe() {
    const { activeLogger, closeLogger } = useLogger()
    return activeLogger ? (
        <div role="dialog" aria-label={`${activeLogger} logger`}>
            <button type="button" onClick={closeLogger}>
                Close logger
            </button>
        </div>
    ) : null
}

const setup = () =>
    render(
        <MantineProvider>
            <LoggingProvider>
                <main data-testid="outside">Page content</main>
                <GlobalLogFab />
                <ActiveLoggerProbe />
            </LoggingProvider>
        </MantineProvider>,
    )

describe('GlobalLogFab', () => {
    it('toggles the stable action menu and closes with Escape or outside click', async () => {
        const user = userEvent.setup()
        setup()
        const launcher = screen.getByRole('button', { name: 'Log health information' })

        await user.click(launcher)
        expect(launcher).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(
            logActions.map(action => action.label),
        )
        await user.keyboard('{Escape}')
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
        expect(launcher).toHaveFocus()

        await user.click(launcher)
        await user.click(screen.getByTestId('outside'))
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it.each(logActions)('opens the $label logger and restores focus after close', async action => {
        const user = userEvent.setup()
        setup()
        const launcher = screen.getByRole('button', { name: 'Log health information' })
        await user.click(launcher)
        const actionButton = screen.getByRole('menuitem', { name: action.label })
        await user.click(actionButton)

        expect(screen.getByRole('dialog', { name: `${action.id} logger` })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Close logger' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(launcher).toHaveFocus()
    })
})
