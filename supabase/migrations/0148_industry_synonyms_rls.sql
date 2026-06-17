-- ============================================================================
-- 0148 — Enable RLS on public.industry_synonyms (public read, admin write)
--
-- industry_synonyms (created in 0041) is the background-match taxonomy that
-- normalises talent/role free-text into canonical industry buckets. It shipped
-- WITHOUT row level security, and 0119 grants SELECT/INSERT/UPDATE/DELETE on
-- every public table to `authenticated`. With RLS off that means any logged-in
-- user can tamper with the matching-input taxonomy.
--
-- This migration brings it in line with the other public-read/admin-write
-- reference tables (e.g. market_rate_cache, tag_dictionary in 0003): everyone
-- may read, only admins may write.
--
-- Idempotent (alter ... enable is a no-op if already on; drop policy if exists
-- before each create).
-- ============================================================================

alter table public.industry_synonyms enable row level security;

-- Public read: the taxonomy is non-secret matching input.
drop policy if exists industry_synonyms_select on public.industry_synonyms;
create policy industry_synonyms_select on public.industry_synonyms
  for select using (true);

-- Admin-only write (insert/update/delete).
drop policy if exists industry_synonyms_all_admin on public.industry_synonyms;
create policy industry_synonyms_all_admin on public.industry_synonyms
  for all using (public.is_admin()) with check (public.is_admin());
