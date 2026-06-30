-- ============================================================
-- 0165 — Request-level idempotency store (request_dedup)
--
-- Protects the money-path POSTs (buy-points, unlock-extra-match,
-- redeem-points) against double-submission at the REQUEST level —
-- i.e. a double-click / retry that would otherwise create a second
-- Billplz/ToyyibPay bill (or fire a second grant attempt) before the
-- DB-level compare-and-set guards kick in.
--
-- How it's used (see _shared/idempotency.ts):
--   The client may send an `Idempotency-Key` header. The first request
--   for a given key INSERTs a row here and runs the handler body; the
--   stored JSON response is then replayed for any retry carrying the
--   same key. The existing DB CAS guards (award_points idempotency_key,
--   redeem_points_for idempotency_key, the `.eq(payment_status,'pending')`
--   flips) remain the authoritative protection against a double GRANT;
--   this table only de-dupes the cheaper BILL-CREATION step.
--
-- Security: service-role only. RLS is enabled with NO policies and no
-- grants to `authenticated`, so the only thing that can read or write
-- this table is an Edge Function using the service-role key (which
-- bypasses RLS). End users can never enumerate other users' keys or
-- responses.
--
-- Cleanup: rows carry a 24h `expires_at`. There is no cron job here on
-- purpose — `withIdempotency` opportunistically ignores expired rows on
-- read, and a periodic purge can be added later (mirror the
-- DO-block unschedule-if-exists cron idiom in 0164 / 0150) once volume
-- warrants it. A simple manual/cron purge is:
--     delete from public.request_dedup where expires_at < now();
--
-- Additive + idempotent (create table/index if not exists; RLS enable
-- is a no-op when already enabled).
-- ============================================================

create table if not exists public.request_dedup (
  key        text primary key,
  user_id    uuid,
  endpoint   text,
  response   jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

-- Supports the (eventual) retention purge of expired keys.
create index if not exists idx_request_dedup_expires_at
  on public.request_dedup (expires_at);

-- Service-role only: enable RLS and grant NOTHING to authenticated.
-- With no policies, every non-service-role read/write returns zero rows
-- / is denied. Edge Functions use the service-role key (bypasses RLS).
alter table public.request_dedup enable row level security;

revoke all on public.request_dedup from anon, authenticated;
