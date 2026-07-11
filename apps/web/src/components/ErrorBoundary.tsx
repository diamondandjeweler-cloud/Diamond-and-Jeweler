import { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { Button } from './ui'
import { createLogger } from '../lib/logger'

const log = createLogger('error-boundary')

interface Props { children: ReactNode }
interface State { err: Error | null; reloading: boolean }

// Stale chunk after deploy: when a user has the previous bundle's index loaded
// in their tab and Vercel has rolled out a new build, the old index references
// asset paths like AuthCallback-OqWzbPZL.js that no longer exist on the edge.
// Vite's lazy-import then throws "Failed to fetch dynamically imported module".
// The user is staring at a fatal error on a route they just clicked. Hard
// reload picks up the new index + new chunks.
function looksLikeStaleChunk(err: Error): boolean {
  const m = (err.message || '').toLowerCase()
  return (
    m.includes('failed to fetch dynamically imported module') ||
    m.includes('failed to import') ||
    m.includes('importing a module script failed') ||
    (m.includes('loading chunk') && m.includes('failed'))
  )
}

const RELOAD_FLAG = 'dnj.errorboundary.reloaded'

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null, reloading: false }
  private _clearTimer?: ReturnType<typeof setTimeout>

  static getDerivedStateFromError(err: Error): State {
    // Auto-recover from stale-chunk-after-deploy by reloading exactly once.
    // The sessionStorage flag prevents an infinite reload loop if the underlying
    // problem isn't a stale chunk (in which case we surface the error UI).
    // NOTE: window.location.reload() is NOT called here — getDerivedStateFromError
    // is a pure static method and React 18 concurrent mode may invoke it multiple
    // times during a single render pass. The reload is deferred to componentDidUpdate.
    if (looksLikeStaleChunk(err)) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1')
          // Return `reloading: true` so we render null (blank) while the
          // reload is in flight, instead of briefly flashing the error screen
          // or attempting to re-render broken children.
          return { err: null, reloading: true }
        }
      } catch { /* tolerate quota / sandboxed iframe */ }
    } else {
      // Not a stale-chunk error — clear any leftover flag so a future stale
      // chunk on this tab still gets one auto-reload.
      try { sessionStorage.removeItem(RELOAD_FLAG) } catch { /* tolerate */ }
    }
    return { err, reloading: false }
  }

  componentDidMount() {
    // Restore "one auto-reload per DEPLOY" (not just one per tab): once the app has
    // stayed healthy for a few seconds after (re)mounting, clear the reload guard so
    // a LATER stale chunk (a second deploy landing in the same long-lived tab) still
    // gets its own one-shot reload. Guarded on no-error + a delay: a bundle that is
    // still broken throws within this window, re-setting err/reloading, so the flag
    // is kept and the infinite-reload guard still holds.
    this._clearTimer = setTimeout(() => {
      if (!this.state.err && !this.state.reloading) {
        try { sessionStorage.removeItem(RELOAD_FLAG) } catch { /* tolerate */ }
      }
    }, 4000)
  }

  componentWillUnmount() {
    if (this._clearTimer) clearTimeout(this._clearTimer)
  }

  componentDidUpdate() {
    // Perform the reload here (a committed lifecycle method, not the render phase)
    // so it fires exactly once after React has committed the reloading state.
    if (this.state.reloading) window.location.reload()
  }

  componentDidCatch(err: Error, info: unknown) {
    log.error('ErrorBoundary caught:', err, info)
    Sentry.captureException(err, { extra: { componentStack: info } })
    // If the page is in a sandboxed iframe or navigation is blocked,
    // window.location.reload() is silently swallowed and the blank screen persists.
    // Fall back to showing the error UI after 3 seconds if reload hasn't fired.
    if (this.state.reloading) {
      setTimeout(() => {
        if (this.state.reloading) this.setState({ err, reloading: false })
      }, 3000)
    }
  }

  render() {
    // Blank screen while the page is reloading to avoid flashing broken UI.
    if (this.state.reloading) return null
    if (this.state.err) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-ink-50">
          <div className="max-w-md w-full bg-white border border-ink-200 rounded-xl2 shadow-card p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 8v5m0 3.5v.01M4.93 19h14.14A2 2 0 0 0 21 16.86L13.93 5.14a2 2 0 0 0-3.46 0L3 16.86A2 2 0 0 0 4.93 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="font-display text-xl text-ink-900 mb-2">Something went wrong</h1>
            <p className="text-ink-600 text-sm mb-5 break-words">
              {import.meta.env.DEV
                ? this.state.err.message
                : 'An unexpected error occurred. Please try again.'}
            </p>
            <Button
              variant="primary"
              onClick={() => window.location.assign('/')}
            >
              Back to home
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
