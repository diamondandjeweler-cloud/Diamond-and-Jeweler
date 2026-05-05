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

  // Lazily load the Turnstile script the first time this component mounts.
  // Previously loaded globally in index.html; moved here so unauthenticated
  // visitors on non-auth pages don't download ~30 KB they'll never use.
  useEffect(() => {
    const SCRIPT_ID = 'cf-turnstile-script'
    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement('script')
      s.id = SCRIPT_ID
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      s.async = true
      s.defer = true
      document.head.appendChild(s)
    }
  }, [])

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
