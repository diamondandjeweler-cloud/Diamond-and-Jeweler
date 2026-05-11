-- 0106 — F34: support_tickets admin policy via is_admin() helper
--
-- F34 reproducer: HEAD /rest/v1/support_tickets?select=* returns 503 under
-- admin context. Root cause: the original policy from 0072 evaluates an inline
-- EXISTS (select 1 from public.profiles where id = auth.uid() and role='admin')
-- on every row read. With RLS enabled and no SELECT grant fallback, PostgREST
-- HEAD count queries stall when other tables (matches, profiles) are
-- contending — same family of failures 0098 + 0103 closed for the rest of the
-- admin surface, now applied to support_tickets.
--
-- Idempotent. Non-destructive. The user-side policies (own-row read/insert)
-- are left untouched.

-- ── Step 1: ensure GRANT SELECT/INSERT/UPDATE exists.
-- Postgres "permission denied" can surface as 503 when RLS is enabled but the
-- table-level grant was tightened away. Belt-and-braces grant.
grant select, insert, update on public.support_tickets to authenticated;

-- ── Step 2: replace the inline-EXISTS admin policy with is_admin() helper.
-- The helper is SECURITY DEFINER and cached per session, removing the per-row
-- subquery cost.
drop policy if exists support_tickets_admin_all on public.support_tickets;

create policy support_tickets_admin_select on public.support_tickets
  for select using (public.is_admin());

create policy support_tickets_admin_update on public.support_tickets
  for update using (public.is_admin()) with check (public.is_admin());

create policy support_tickets_admin_insert on public.support_tickets
  for insert with check (public.is_admin());

-- (No DELETE policy by design — tickets are immutable history; admin uses
--  status='resolved' instead of deletion.)

-- ── Step 3: refresh PostgREST schema cache so the policy swap is picked up
-- without a function redeploy.
notify pgrst, 'reload schema';

-- ── Verification (run after this migration applies):
--   curl -X HEAD "$SUPABASE_URL/rest/v1/support_tickets?select=*" \
--     -H "Authorization: Bearer $ADMIN_JWT" -H "apikey: $ANON_KEY"
--   → expect 200 with Content-Range: 0-N/M (was 503)
--
--   Admin → Support tab should continue to list tickets (already
--   verified working in 2026-05-10 closeout — this migration prevents
--   regression under HEAD count contention).
