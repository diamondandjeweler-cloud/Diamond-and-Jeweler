/* eslint-disable react-refresh/only-export-components -- Provider + useToast hook
   are intentionally colocated in this context module. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'

/**
 * Lightweight toast system: <ToastProvider> (mount once at the app root) exposes
 * a `useToast()` hook for transient feedback. Toasts render into a portalled,
 * safe-area-aware stack; errors/warnings announce assertively (role="alert"),
 * successes/info announce politely via the container's live region.
 */

type ToastTone = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  message: ReactNode
  tone: ToastTone
  duration: number
}

interface ToastApi {
  show: (message: ReactNode, opts?: { tone?: ToastTone; duration?: number }) => number
  success: (message: ReactNode, duration?: number) => number
  error: (message: ReactNode, duration?: number) => number
  info: (message: ReactNode, duration?: number) => number
  warning: (message: ReactNode, duration?: number) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast() must be used within <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (message: ReactNode, opts?: { tone?: ToastTone; duration?: number }) => {
      const id = (idRef.current += 1)
      const tone = opts?.tone ?? 'info'
      const duration = opts?.duration ?? 4000
      setToasts((list) => [...list, { id, message, tone, duration }])
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration))
      }
      return id
    },
    [dismiss],
  )

  // Clear any pending auto-dismiss timers when the provider unmounts.
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => clearTimeout(t))
      map.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m, d) => show(m, { tone: 'success', duration: d }),
      error: (m, d) => show(m, { tone: 'error', duration: d ?? 6000 }),
      info: (m, d) => show(m, { tone: 'info', duration: d }),
      warning: (m, d) => show(m, { tone: 'warning', duration: d }),
      dismiss,
    }),
    [show, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

const TONE: Record<ToastTone, string> = {
  success:
    'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-800/60 dark:text-emerald-100',
  error:
    'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/50 dark:border-red-800/60 dark:text-red-100',
  info: 'bg-surface border-border text-fg',
  warning:
    'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/50 dark:border-amber-800/60 dark:text-amber-100',
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
      className="fixed z-[60] bottom-4 right-4 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' || t.tone === 'warning' ? 'alert' : undefined}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-float animate-slide-up',
            TONE[t.tone],
          )}
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
