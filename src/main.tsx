import React from 'react'
import ReactDOM from 'react-dom/client'
import '@mantine/core/styles.css'
import { MantineProvider } from '@mantine/core'
import { BrowserRouter } from 'react-router-dom'
import { theme } from './app/theme'
import { AuthGate } from './components/AuthGate'
import './styles.css'
import App from './App'
import { ServerDataProvider } from './hooks/useServerData'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <MantineProvider theme={theme} defaultColorScheme="light">
            <BrowserRouter>
                <AuthGate>
                    <ServerDataProvider>
                        <App />
                    </ServerDataProvider>
                </AuthGate>
            </BrowserRouter>
        </MantineProvider>
    </React.StrictMode>,
)
