import React from 'react'
import ReactDOM from 'react-dom/client'
import '@mantine/core/styles.css'
import { MantineProvider } from '@mantine/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { theme } from './app/theme'
import { AuthGate } from './components/AuthGate'
import './styles.css'
import './today.css'
import './ux-journey.css'
import './mcp.css'
import './plan-scheduling.css'
import './food-logger.css'
import App from './App'
import { ServerDataProvider } from './hooks/useServerData'
import { LoggingProvider } from './logging/LoggingContext'
import { queryClient } from './lib/queryClient'
import { installServerQueryInvalidation } from './lib/serverQueries'

const chunkReloadKey = 'trackit:chunk-reload'
window.addEventListener('vite:preloadError', event => {
    event.preventDefault()
    const lastReload = Number(sessionStorage.getItem(chunkReloadKey) ?? 0)
    if (Date.now() - lastReload < 60_000) return
    sessionStorage.setItem(chunkReloadKey, String(Date.now()))
    window.location.reload()
})
window.setTimeout(() => sessionStorage.removeItem(chunkReloadKey), 10_000)
installServerQueryInvalidation()

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <MantineProvider theme={theme} defaultColorScheme="light">
            <BrowserRouter>
                <QueryClientProvider client={queryClient}>
                    <AuthGate>
                        <ServerDataProvider>
                            <LoggingProvider>
                                <App />
                            </LoggingProvider>
                        </ServerDataProvider>
                    </AuthGate>
                </QueryClientProvider>
            </BrowserRouter>
        </MantineProvider>
    </React.StrictMode>,
)
