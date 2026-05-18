import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SWRConfig } from 'swr'
import * as Sentry from '@sentry/react'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { swrConfig } from './lib/swr'
import { bootstrapSession } from './state/useSession'
import { getCurrentLegalVersion } from './lib/legalVersion'
import './index.css'
import './lib/i18n'

// Start both async operations before React renders.
// bootstrapSession: INITIAL_SESSION fires while React builds the tree.
// getCurrentLegalVersion: warms the localStorage cache before ConsentGate mounts,
// and deduplicates with any concurrent ConsentGate fetch so only one round-trip fires.
bootstrapSession()
void getCurrentLegalVersion()

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SWRConfig value={swrConfig}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      </SWRConfig>
    </ErrorBoundary>
  </React.StrictMode>,
)
