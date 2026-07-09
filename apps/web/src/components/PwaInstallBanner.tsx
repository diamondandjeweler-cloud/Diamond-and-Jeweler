import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const DISMISSED_KEY = 'dnj-pwa-dismissed'
const INSTALLED_KEY  = 'dnj-pwa-installed'
const ENGAGE_TIME_MS = 30_000
const ENGAGE_NAV_MIN = 2

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaInstallBanner() {
  const [show, setShow] = useState(false)
  const location = useLocation()
  const deferredPrompt  = useRef<BeforeInstallPromptEvent | null>(null)
  const navCount        = useRef(0)
  const timerFired      = useRef(false)
  const triedToShow     = useRef(false)

  const tryShow = () => {
    if (triedToShow.current) return
    if (!timerFired.current || navCount.current < ENGAGE_NAV_MIN) return
    if (!deferredPrompt.current) return
    triedToShow.current = true
    setShow(true)
  }

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) || localStorage.getItem(INSTALLED_KEY)) return

    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      tryShow()
    }
    window.addEventListener('beforeinstallprompt', handler)

    const timer = setTimeout(() => {
      timerFired.current = true
      tryShow()
    }, ENGAGE_TIME_MS)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Count page navigations
  useEffect(() => {
    navCount.current += 1
    tryShow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const handleAdd = async () => {
    if (!deferredPrompt.current) return
    await deferredPrompt.current.prompt()
    const { outcome } = await deferredPrompt.current.userChoice
    if (outcome === 'accepted') localStorage.setItem(INSTALLED_KEY, '1')
    deferredPrompt.current = null
    setShow(false)
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
      role="dialog"
      aria-label="Add DNJ to home screen"
    >
      <div className="bg-white shadow-lg rounded-t-2xl flex items-center gap-3 px-4 py-3" style={{ minHeight: 80 }}>
        <DiamondMark />

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-navy-900 leading-tight">Add DNJ to your home screen</p>
          <p className="text-xs text-gray-500 mt-0.5">Tap for instant job match access</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => void handleAdd()}
            className="bg-navy-800 text-white rounded-xl px-4 py-1.5 text-sm font-semibold"
          >
            Add
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-gray-400 text-xl leading-none"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

function DiamondMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="pwa-bm-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a6b6ff" />
          <stop offset="1" stopColor="#5468ef" />
        </linearGradient>
        <linearGradient id="pwa-bm-pav" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3e4fd3" />
          <stop offset="1" stopColor="#0b1742" />
        </linearGradient>
      </defs>
      <polygon points="6,16 22,4 38,16" fill="url(#pwa-bm-crown)" stroke="#0b1742" strokeWidth="0.9" strokeLinejoin="round" />
      <polygon points="6,16 38,16 22,40" fill="url(#pwa-bm-pav)" stroke="#0b1742" strokeWidth="0.9" strokeLinejoin="round" />
      <line x1="6" y1="16" x2="38" y2="16" stroke="#0b1742" strokeWidth="0.7" />
      <line x1="14" y1="4" x2="14" y2="16" stroke="#0b1742" strokeWidth="0.5" opacity="0.55" />
      <line x1="22" y1="4" x2="22" y2="16" stroke="#0b1742" strokeWidth="0.5" opacity="0.55" />
      <line x1="30" y1="4" x2="30" y2="16" stroke="#0b1742" strokeWidth="0.5" opacity="0.55" />
      <line x1="14" y1="16" x2="22" y2="40" stroke="#a6b6ff" strokeWidth="0.5" opacity="0.5" />
      <line x1="30" y1="16" x2="22" y2="40" stroke="#a6b6ff" strokeWidth="0.5" opacity="0.5" />
      <line x1="22" y1="16" x2="22" y2="40" stroke="#a6b6ff" strokeWidth="0.5" opacity="0.5" />
      <polygon points="9,15 22,5 19,15" fill="#ffffff" opacity="0.55" />
    </svg>
  )
}
