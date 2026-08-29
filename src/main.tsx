import React from 'react'
import ReactDOM from 'react-dom/client'
import '@mantine/core/styles.css'
import { MantineProvider } from '@mantine/core'
import { BrowserRouter } from 'react-router-dom'
import { theme } from './app/theme'
import { AuthGate } from './components/AuthGate'
import './styles.css'
import './today.css'
import App from './App'
import { ServerDataProvider } from './hooks/useServerData'
import { LoggingProvider } from './logging/LoggingContext'

const chunkReloadKey = 'trackit:chunk-reload'
window.addEventListener('vite:preloadError', event => {
    event.preventDefault()
    const lastReload = Number(sessionStorage.getItem(chunkReloadKey) ?? 0)
    if (Date.now() - lastReload < 60_000) return
    sessionStorage.setItem(chunkReloadKey, String(Date.now()))
    window.location.reload()
})
window.setTimeout(() => sessionStorage.removeItem(chunkReloadKey), 10_000)

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <MantineProvider theme={theme} defaultColorScheme="light">
            <BrowserRouter>
                <AuthGate>
                    <ServerDataProvider>
                        <LoggingProvider>
                            <App />
                        </LoggingProvider>
                    </ServerDataProvider>
                </AuthGate>
            </BrowserRouter>
        </MantineProvider>
    </React.StrictMode>,
)
