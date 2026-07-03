import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type ConsultBookingRow = Database['public']['Tables']['consult_bookings']['Row']

// ── consult_bookings: paid consultation bookings ─────────────────────────────
// Mirrors systemConfig.ts / points.ts — functions return the query BUILDER so
// callers keep their own terminal consumption (.then / await), and the .select
// projection is passed through verbatim from the original call site.

/** Status + video URL of one booking by id (Consult return-poller) → caller keeps its .then. */
export function consultBookingStatusById(bookingId: string) {
  return supabase.from('consult_bookings').select('status, video_url').eq('id', bookingId).maybeSingle().returns<Pick<ConsultBookingRow, 'status' | 'video_url'>>()
}
