import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string
          theme?: 'auto' | 'light' | 'dark'
          size?: 'normal' | 'flexible' | 'compact'
          callback?: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
          'timeout-callback'?: () => void
        },
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
      getResponse: (widgetId?: string) => string | undefined
    }
  }
}

const TEST_SITE_KEY = '1x00000000000000000000AA' // Cloudflare always-pass dev key

interface Props {
  onToken: (token: string | null) => void
  theme?: 'auto' | 'light' | 'dark'
}

export default function Turnstile({ onToken, theme = 'light' }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    let cancelled = false
    function tryRender() {
      if (cancelled) return
      const el = elRef.current
      const ts = window.turnstile
      if (!el || !ts) {
        setTimeout(tryRender, 200)
        return
      }
      const sitekey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || TEST_SITE_KEY
      widgetIdRef.current = ts.render(el, {
        sitekey,
        theme,
        size: 'flexible',
        callback: (token) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
        'timeout-callback': () => onTokenRef.current(null),
      })
    }
    tryRender()
    return () => {
      cancelled = true
      const ts = window.turnstile
      if (ts && widgetIdRef.current) {
        try { ts.remove(widgetIdRef.current) } catch { /* ignore */ }
        widgetIdRef.current = null
      }
    }
  }, [theme])

  return <div ref={elRef} className="my-2" />
}
