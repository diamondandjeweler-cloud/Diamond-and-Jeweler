import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SWRConfig } from 'swr'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { swrConfig } from './lib/swr'
import './index.css'
import './lib/i18n'

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
