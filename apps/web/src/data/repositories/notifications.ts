import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type NotificationRow = Database['public']['Tables']['notifications']['Row']

// ── Notification reads & writes ──────────────────────────────────────────────
// Centralizes the `notifications` table behind one seam (mirrors src/data/
// repositories/matches.ts). The realtime channel subscription in NotificationBell
// is left inline — it is a `.channel()` stream, not a `.from()` query — so this
// only covers the row reads/writes. Functions return the query BUILDER so callers
// keep their own terminal operators (.then via await, chained .eq filter), and
// each .select projection is passed through verbatim.

// In-app bell projection — talent/HM-facing, no admin columns.
const BELL_SELECT = 'id, type, subject, body, read, sent_at'
// Admin log projection — adds routing columns + the recipient join.
const ADMIN_LOG_SELECT = 'id, user_id, type, channel, subject, body, read, sent_at, data, profiles(email, full_name)'

/** Latest in-app notifications for the bell dropdown (newest first, capped at 20). */
export function inAppNotifications() {
  return supabase
    .from('notifications')
    .select(BELL_SELECT)
    .eq('channel', 'in_app')
    .order('sent_at', { ascending: false })
    .limit(20)
    .returns<Pick<NotificationRow, 'id' | 'type' | 'subject' | 'body' | 'read' | 'sent_at'>[]>()
}

/**
 * Admin notification log (newest first, capped at 100). The caller still chains
 * the optional channel filter (.eq('channel', …)) so behaviour is unchanged.
 */
export function adminNotificationLog() {
  return supabase
    .from('notifications')
    .select(ADMIN_LOG_SELECT)
    .order('sent_at', { ascending: false })
    .limit(100)
}

/** Mark a set of notifications read by id (bell "mark all read"). */
export function markNotificationsRead(ids: string[]) {
  return supabase.from('notifications').update({ read: true }).in('id', ids)
}
