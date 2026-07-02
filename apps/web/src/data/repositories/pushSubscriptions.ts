import { supabase } from '../../lib/supabase'

// ── push_subscriptions: Web-Push endpoints per user ──────────────────────────
// Mirrors systemConfig.ts / points.ts — the function returns the query BUILDER
// so the caller keeps its own await; payload and onConflict are passed through
// verbatim from the original call site (usePushSubscription).

/** Web-Push subscription JSON shape stored per (user, endpoint). */
export type PushSubscriptionJson = { endpoint: string; keys: { p256dh: string; auth: string } }

/** Upsert a user's push subscription keyed on (user_id, endpoint) → { error }. */
export function upsertPushSubscription(userId: string, subJson: PushSubscriptionJson) {
  return supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint: subJson.endpoint, subscription: subJson },
      { onConflict: 'user_id,endpoint' }
    )
}
