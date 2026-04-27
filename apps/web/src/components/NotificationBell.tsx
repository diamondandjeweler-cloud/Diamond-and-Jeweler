import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../state/useSession'

interface NotificationRow {
  id: string
  type: string
  subject: string | null
  body: string | null
  read: boolean
  sent_at: string
}

export default function NotificationBell() {
  const { session } = useSession()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [open, setOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const unread = items.filter((i) => !i.read).length

  // Initial load + realtime subscription.
  useEffect(() => {
    if (!session) return
    let cancelled = false

    void (async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, subject, body, read, sent_at')
        .eq('channel', 'in_app')
        .order('sent_at', { ascending: false })
        .limit(20)
      if (!cancelled) setItems((data ?? []) as NotificationRow[])
    })()

    const channel = supabase
      .channel(`notif-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${session.user.id}`,
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
  }, [session])

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
    const { error } = await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
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
        className="relative p-1.5 text-gray-600 hover:text-gray-900"
        aria-label={unread > 0 ? `Notifications: ${unread} unread` : 'Notifications'}
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
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 bg-white border rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto"
        >
          <div className="flex justify-between items-center p-3 border-b">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs text-brand-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 text-center">No notifications yet.</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`p-3 text-sm ${n.read ? '' : 'bg-brand-50'}`}
                >
                  {n.subject && <div className="font-medium">{n.subject}</div>}
                  {n.body && (
                    <div className="text-gray-600 text-xs mt-1 line-clamp-3 whitespace-pre-line">
                      {n.body}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 mt-1">
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
