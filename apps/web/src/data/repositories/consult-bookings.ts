import { supabase } from '../../lib/supabase'

// ── consult_bookings reads ────────────────────────────────────────────────────
// One-on-one consult bookings. Hand-queried only from the Consult page, which
// polls a single booking by id after a payment-return redirect. Centralizes that
// shape behind one seam (mirrors src/data/repositories/matches.ts + profiles.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.maybeSingle / .then) — behaviour is byte-identical to the
// inlined query it replaces. The .select projection is passed through verbatim
// from the call site so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/**
 * A single booking's status + video URL by id (Consult payment-return poll —
 * caller adds .maybeSingle()).
 */
export function consultBookingStatusById(bookingId: string) {
  return supabase
    .from('consult_bookings')
    .select('status, video_url')
    .eq('id', bookingId)
}
