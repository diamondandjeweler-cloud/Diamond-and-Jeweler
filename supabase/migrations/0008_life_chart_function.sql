-- ============================================================
-- BoLe Platform — Life-chart scoring scaffold
--
-- Provides the SQL surface that match-generate calls. The body is a
-- DELIBERATE PLACEHOLDER that returns NULL — your proprietary algorithm
-- replaces the marked section. Until it's replaced, match-generate uses
-- tag_compatibility only (see docs/life-chart-integration.md).
--
-- Memoisation via public.life_chart_cache ensures that once the algorithm
-- computes a score for a DOB pair, subsequent match generations are O(1).
-- ============================================================

-- ---------- compute_life_chart_score ----------
-- Inputs: two DOBs (order-independent — we normalise inside the function).
-- Output: numeric 0..100, or NULL if the algorithm hasn't been plugged in.

create or replace function public.compute_life_chart_score(dob1 date, dob2 date)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  d1 date := least(dob1, dob2);
  d2 date := greatest(dob1, dob2);
  cached numeric;
  result numeric;
begin
  -- Cache hit (including cached nulls — NULLs are NOT cached; see below).
  select score into cached
    from public.life_chart_cache
    where public.life_chart_cache.dob1 = d1
      and public.life_chart_cache.dob2 = d2
    limit 1;

  if cached is not null then
    return cached;
  end if;

  -- =========================================================================
  -- >>>> YOUR PROPRIETARY ALGORITHM GOES HERE <<<<
  --
  -- Intended inputs (populate these tables first via admin tooling or SQL):
  --   public.life_chart_base          — base numbers by birth-date range + gender
  --   public.life_chart_adjustments   — month/day adjustments by gender
  --
  -- Expected output: numeric 0..100. NULL = "not enough data to score".
  --
  -- Example skeleton (intentionally commented out):
  --
  -- declare base1 int; base2 int; begin
  --   select base_number into base1 from public.life_chart_base
  --     where gender_guess_from_dob(d1) = gender
  --       and d1 between start_date and end_date limit 1;
  --   select base_number into base2 from public.life_chart_base
  --     where gender_guess_from_dob(d2) = gender
  --       and d2 between start_date and end_date limit 1;
  --   if base1 is null or base2 is null then return null; end if;
  --   result := 100 - abs(base1 - base2) * 10;  -- placeholder math
  -- end;
  --
  -- For now, return NULL so match-generate falls back to tag-only scoring.
  -- =========================================================================

  result := null;

  -- Only cache NON-NULL scores. Skipping null-caching means once you plug in
  -- the algorithm, previously-uncomputed pairs get scored on next match pass.
  if result is not null then
    insert into public.life_chart_cache (dob1, dob2, score)
    values (d1, d2, result)
    on conflict (dob1, dob2) do nothing;
  end if;

  return result;
end;
$$;

revoke execute on function public.compute_life_chart_score(date, date) from public;
grant execute on function public.compute_life_chart_score(date, date) to service_role;
-- Admins can test the function interactively for debugging.
grant execute on function public.compute_life_chart_score(date, date) to authenticated;
