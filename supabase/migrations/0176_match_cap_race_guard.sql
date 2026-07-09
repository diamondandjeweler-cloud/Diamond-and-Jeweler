-- =============================================================================
-- 0176 — matcher active-cap race guard (AUDIT #8)  (2026-07-10)
-- =============================================================================
-- match-core.ts guards the free active-match cap (3 per role) by reading the
-- active count (match-core.ts:333) and sizing the insert with
--   slots = 3 - activeCount            (match-core.ts:1156)
-- The count read and the INSERT (match-core.ts:1229) are separated by the whole
-- scoring phase (RPCs + up to 15s of LLM calls), and each is its own PostgREST
-- statement/transaction. Two concurrent matchForRole runs for the SAME role
-- therefore both read activeCount=N, both size to 3-N, and both insert — so a
-- role can end up with >3 active matches. `slots` already prevents a single run
-- from overshooting; the only defect is the check-vs-insert race across runs.
--
-- FIX: a BEFORE INSERT trigger that, for non-extra (free) matches, takes a
-- per-role transaction advisory lock and re-counts active matches with the
-- committed rows visible, raising if the role is already at cap. The advisory
-- lock serialises concurrent inserts for the same role, so the count is
-- authoritative at insert time. Paid unlocks (is_extra_match) bypass the cap,
-- exactly as match-core does, and are not serialised.
--
-- Why a trigger (not a rewritten SQL insert): it leaves the existing multi-
-- column PostgREST insert untouched (zero column-mapping risk on a live money
-- path) and can only RAISE or PASS — it never alters row values, so it cannot
-- corrupt a match. It is a pure backstop: the common path is still handled by
-- the existing pre-check + `slots`; the trigger only fires on a genuine race.
--
-- Behaviour change: a losing concurrent run now raises 'MATCH_CAP_REACHED'
-- instead of silently overshooting. match-core catches that message and returns
-- { matches_added: 0 } (graceful), matching the pre-check's own over-cap return.
--
-- Cap = 3, hard-coded to mirror match-core.ts:336 exactly. The active-status
-- list mirrors match-core.ts:329-332.
--
-- Additive + reversible. ROLLBACK:
--   drop trigger if exists trg_enforce_match_cap on public.matches;
--   drop function if exists public.enforce_match_cap();
-- =============================================================================

begin;

create or replace function public.enforce_match_cap()
returns trigger
language plpgsql
as $$
declare
  v_active integer;
  v_cap    constant integer := 3;  -- mirrors match-core.ts:336
begin
  -- Paid/redeemed unlocks bypass the free cap and are not serialised.
  if coalesce(new.is_extra_match, false) then
    return new;
  end if;

  -- Serialise concurrent inserts for this role so the count below is
  -- authoritative (released automatically at transaction end).
  perform pg_advisory_xact_lock(hashtext('matchgen'), hashtext(new.role_id::text));

  select count(*) into v_active
  from public.matches
  where role_id = new.role_id
    and status in (
      'pending_approval','generated','viewed','accepted_by_talent',
      'invited_by_manager','hr_scheduling','interview_scheduled',
      'interview_completed','offer_made'
    );

  if v_active >= v_cap then
    raise exception 'MATCH_CAP_REACHED: role % already has % active matches (cap %)',
      new.role_id, v_active, v_cap
      using errcode = 'MATCP';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_match_cap on public.matches;
create trigger trg_enforce_match_cap
  before insert on public.matches
  for each row execute function public.enforce_match_cap();

commit;
