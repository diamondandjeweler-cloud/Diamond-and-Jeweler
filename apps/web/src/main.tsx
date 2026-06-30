import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
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

// Sentry init is deferred to requestIdleCallback so it doesn't block the first
// paint or steal main-thread time during the critical render path. Errors that
// occur before idle still get caught by ErrorBoundary and the browser's own
// window.onerror; Sentry just won't report them — acceptable trade-off for
// cold-load performance.
if (import.meta.env.VITE_SENTRY_DSN) {
  const initSentry = () => {
    void import('@sentry/react').then((Sentry) => {
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        integrations: [Sentry.browserTracingIntegration()],
        tracesSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      })
    })
  }
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
  if (ric) ric(initSentry, { timeout: 4000 })
  else setTimeout(initSentry, 2000)
}

// Remove the static app-shell skeleton (from index.html) as soon as React
// commits its first render. The CSS `#root:has(*)` rule already handles this
// in modern browsers; this is the explicit JS fallback for any browser that
// doesn't yet support :has() (and a belt-and-braces guarantee that the shell
// never lingers behind the React tree).
function removeAppShell() {
  const shell = document.getElementById('dnj-shell')
  if (shell && shell.parentNode) shell.parentNode.removeChild(shell)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)

// First paint happens after React commits; queue the shell removal for the next
// frame so we don't fight React for the same paint cycle.
requestAnimationFrame(removeAppShell)

// Service worker — registered after first paint so the SW install never blocks
// the critical render. Cache-first for hashed assets means returning users
// skip the network entirely for JS/CSS/fonts/images. Workbox auto-update
// activates new deploys on next reload (skipWaiting + clientsClaim in the
// vite-plugin-pwa config).
//
// Disabled in dev (Vite serves modules; SW would intercept HMR) and when the
// browser doesn't support service workers (older Safari/Firefox configs).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const registerSw = () => {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      try {
        registerSW({
          immediate: false,
          onRegisteredSW(_swUrl, registration) {
            // Best-effort: periodic check so long-lived tabs pick up new deploys.
            if (registration) {
              const id = setInterval(() => { void registration.update().catch(() => {}) }, 60 * 60 * 1000)
              if (import.meta.hot) import.meta.hot.dispose(() => clearInterval(id))
            }
          },
          onRegisterError(err) {
            console.warn('[sw] register failed', err)
          },
        })
      } catch (err) {
        console.warn('[sw] register threw', err)
      }
    }).catch((err) => {
      console.warn('[sw] dynamic import failed', err)
    })
  }
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
  if (ric) ric(registerSw, { timeout: 4000 })
  else setTimeout(registerSw, 2500)
}
