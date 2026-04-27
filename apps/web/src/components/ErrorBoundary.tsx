import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { err: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error) { return { err } }

  componentDidCatch(err: Error, info: unknown) {
    console.error('ErrorBoundary caught:', err, info)
  }

  render() {
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
            <p className="text-ink-600 text-sm mb-5 break-words">{this.state.err.message}</p>
            <button
              onClick={() => window.location.assign('/')}
              className="btn-primary"
            >
              Back to home
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
