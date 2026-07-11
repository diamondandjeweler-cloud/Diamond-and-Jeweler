import { useState, useEffect, useRef } from 'react'
import { useSession } from '../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { upsertPushSubscription, type PushSubscriptionJson } from '../data/repositories/pushSubscriptions'
import { createLogger } from './logger'

const log = createLogger('push')

const SUBSCRIBED_KEY = 'dnj-push-subscribed'
const ASK_DELAY_MS   = 60_000  // wait 60 s after login before nudging

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const arr     = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export type PushState = 'idle' | 'subscribed' | 'denied' | 'unsupported'

export function usePushSubscription() {
  const { session, profile } = useSession(useShallow((s) => ({ session: s.session, profile: s.profile })))
  const [state, setState] = useState<PushState>('idle')
  const [subscribing, setSubscribing] = useState(false)
  const alreadyAsked = useRef(false)

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

  const isTalent = profile?.role === 'talent'

  useEffect(() => {
    if (!isTalent) return
    if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') { setState('denied'); return }
    if (localStorage.getItem(SUBSCRIBED_KEY)) { setState('subscribed'); return }
  }, [isTalent])

  const subscribe = async () => {
    if (!session || !isTalent || !vapidKey) return
    if (!('serviceWorker' in navigator)) return
    setSubscribing(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setState('denied'); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const subJson = sub.toJSON() as PushSubscriptionJson

      const { error } = await upsertPushSubscription(session.user.id, subJson)
      if (error) throw error

      localStorage.setItem(SUBSCRIBED_KEY, '1')
      alreadyAsked.current = true
      setState('subscribed')
    } catch (err) {
      log.warn('[push] subscribe failed', err)
    } finally {
      setSubscribing(false)
    }
  }

  // iOS note: Web Push only works from a PWA home-screen app on iOS 16.4+
  const isIos = /iP(hone|ad|od)/.test(navigator.userAgent)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches

  const showIosHint = isIos && !isStandalone && state !== 'subscribed'

  return { state, subscribe, subscribing, showIosHint, vapidReady: !!vapidKey }
}

/** Auto-prompt after ASK_DELAY_MS if still idle. Call inside TalentDashboard. */
export function useAutoAskPush() {
  const push = usePushSubscription()
  const prompted = useRef(false)

  useEffect(() => {
    if (push.state !== 'idle' || prompted.current || !push.vapidReady) return
    const t = setTimeout(() => {
      if (push.state === 'idle' && !prompted.current) {
        prompted.current = true
        // Don't auto-trigger — just let the banner show; explicit opt-in only
      }
    }, ASK_DELAY_MS)
    return () => clearTimeout(t)
  }, [push.state, push.vapidReady])

  return push
}
