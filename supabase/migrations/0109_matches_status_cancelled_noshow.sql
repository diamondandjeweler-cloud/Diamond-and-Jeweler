-- ============================================================
-- 0109 — Extend matches.status CHECK constraint to include
--        'cancelled' and 'no_show'.
--
-- Why this exists:
-- The `matches_status_check` CHECK constraint enumerates the valid
-- values for `matches.status`. Earlier migrations added the
-- `validate_match_transition` trigger (0011/0016) and the
-- `interview-action` Edge Function which transition matches into
-- `cancelled` and `no_show` — but the underlying CHECK constraint
-- was never extended to permit those values, so every UPDATE that
-- tried to land on those states was silently rejected at the row
-- level with error 23514. The Edge Function did not surface the
-- error (it `await`-ed without checking), so the API returned
-- `{"ok": true}` while the DB stayed unchanged.
--
-- Mirrors the same pattern fixed in 0073 for `pending_approval`.
--
-- Side effect: pairs with the interview-action Edge Function
-- being patched in the same change to actually check `error` after
-- every update, so any future omission of this kind surfaces.
-- ============================================================

alter table public.matches drop constraint if exists matches_status_check;

alter table public.matches
  add constraint matches_status_check check (status = any (array[
    'pending_approval'::text,
    'generated'::text,
    'viewed'::text,
    'accepted_by_talent'::text,
    'declined_by_talent'::text,
    'invited_by_manager'::text,
    'declined_by_manager'::text,
    'hr_scheduling'::text,
    'interview_scheduled'::text,
    'interview_completed'::text,
    'offer_made'::text,
    'hired'::text,
    'expired'::text,
    'cancelled'::text,
    'no_show'::text
  ]));
