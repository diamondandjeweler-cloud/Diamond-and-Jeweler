import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { inAppNotifications, markNotificationsRead } from '../data/repositories/notifications'
import { useSession } from '../state/useSession'
import { useShallow } from 'zustand/react/shallow'

interface NotificationRow {
  id: string
  type: string
  subject: string | null
  body: string | null
  read: boolean
  sent_at: string
}

export default function NotificationBell() {
  const { session } = useSession(useShallow((s) => ({ session: s.session })))
  const { t } = useTranslation()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [open, setOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const unread = items.filter((i) => !i.read).length

  // Initial load + realtime subscription. Depending on `session.user.id` (not
  // the whole session object) means token refreshes — which produce a fresh
  // session reference every ~hour — don't re-fire this effect.
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    void (async () => {
      const { data } = await inAppNotifications()
      if (!cancelled) setItems(data ?? [])
    })()

    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setItems((xs) => [payload.new as NotificationRow, ...xs].slice(0, 20))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [userId])

  // Close on outside click or Escape key.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function markAllRead() {
    const unreadIds = items.filter((i) => !i.read).map((i) => i.id)
    if (unreadIds.length === 0) return
    // Optimistic flip first, then reconcile on server error.
    setItems((xs) => xs.map((i) => ({ ...i, read: true })))
    const { error } = await markNotificationsRead(unreadIds)
    if (error) {
      console.error('notifications markAllRead failed:', error)
      // Roll back the flag on just the ones we tried to flip.
      const failed = new Set(unreadIds)
      setItems((xs) => xs.map((i) => (failed.has(i.id) ? { ...i, read: false } : i)))
    }
  }

  if (!session) return null

  return (
    <div className="relative" ref={dropRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        aria-label={unread > 0 ? t('notif.unreadAria', { count: unread }) : t('notif.title')}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notif.title')}
          className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto"
        >
          <div className="flex justify-between items-center p-3 border-b dark:border-gray-700">
            <h3 className="font-semibold text-sm dark:text-white">{t('notif.title')}</h3>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs text-brand-600 hover:underline"
              >
                {t('notif.markAllRead')}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">{t('notif.empty')}</p>
          ) : (
            <ul className="divide-y dark:divide-gray-700">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`p-3 text-sm ${n.read ? '' : 'bg-brand-50 dark:bg-brand-950/40'}`}
                >
                  {n.subject && <div className="font-medium dark:text-white">{n.subject}</div>}
                  {n.body && (
                    <div className="text-gray-600 dark:text-gray-300 text-xs mt-1 line-clamp-3 whitespace-pre-line">
                      {n.body}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                    {new Date(n.sent_at).toLocaleString('en-MY', {
                      timeZone: 'Asia/Kuala_Lumpur',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
