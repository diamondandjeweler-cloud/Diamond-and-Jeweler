-- =============================================================================
-- 0206 — matcher active-cap: statement-level guard (finding matcher-1)  (2026-07-13)
-- =============================================================================
-- 0176 added a per-ROW BEFORE INSERT trigger (enforce_match_cap) to backstop the
-- free active-match cap (3 per role) against the check-vs-insert race in
-- match-core.ts. That guard is INSUFFICIENT for a multi-row INSERT:
--
--   match-core.ts:1242 sends the batch as ONE statement:
--       insert into matches values (r1),(r2),(r3)
--   A per-row BEFORE trigger runs `select count(*)` once per row, but by
--   PostgreSQL command visibility the sibling rows of the SAME INSERT are
--   invisible to each other's SELECT (the classic reason a per-row trigger
--   cannot enforce a max-row-count on a bulk insert). So if a concurrent
--   single-row commit (a paid is_extra_match delivery, or an admin force-match)
--   lands in the seconds-long scoring window and raises the committed active
--   count to 1–2 (still < 3), all three sibling rows observe committed < 3, all
--   pass, and the role ends with 4–5 active matches — the invariant 0176 claims
--   to enforce is still violable.
--
-- FIX: replace the per-row BEFORE trigger with a STATEMENT-level AFTER INSERT
-- trigger that uses a transition table (REFERENCING NEW TABLE AS inserted).
-- The transition table makes EVERY sibling row of the batch visible, so we can
-- count committed active rows (excluding this statement's own rows) + the new
-- free rows of the batch and raise if the total would exceed the cap. Under the
-- per-role advisory lock the count is authoritative against concurrent inserts.
--
-- Semantics preserved from 0176:
--   • Cap = 3, active-status list identical to match-core.ts / 0176.
--   • Paid/redeemed unlocks (is_extra_match=true) bypass the free cap — they are
--     excluded from the new-row count (a batch of only extras never raises).
--   • On overshoot the trigger raises 'MATCH_CAP_REACHED' with SQLSTATE 'MATCP',
--     which match-core.ts already catches (match-core.ts:1248-1250) and turns
--     into a graceful { matches_added: 0 }. A losing concurrent free run adds 0
--     instead of overshooting — no data loss, invariant held.
--
-- Trade-off: a statement-level trigger can only PASS or RAISE (roll back the
-- whole INSERT); it cannot partially insert. So a race that leaves room for 2
-- of a 3-row batch rolls back all 3 rather than trimming to 2. That is the
-- correct fail-safe for a hard cap and matches the pre-check's own over-cap
-- return. The common (no-race) path is still served by the match-core pre-check
-- + `slots` sizing, so the trigger only fires on a genuine concurrent overshoot.
--
-- Additive + reversible. ROLLBACK:
--   drop trigger if exists trg_enforce_match_cap_stmt on public.matches;
--   drop function if exists public.enforce_match_cap_stmt();
--   -- (then optionally re-create the 0176 per-row trigger/function)
-- =============================================================================

begin;

-- Remove the insufficient per-row guard from 0176.
drop trigger  if exists trg_enforce_match_cap on public.matches;
drop function if exists public.enforce_match_cap();

create or replace function public.enforce_match_cap_stmt()
returns trigger
language plpgsql
as $$
declare
  r           record;
  v_committed integer;
  v_cap       constant integer := 3;  -- mirrors match-core.ts:346 / 0176
begin
  -- One iteration per role touched by this INSERT statement. new_free counts the
  -- new NON-extra (free) rows of the batch for that role; is_extra_match rows are
  -- paid unlocks that bypass the free cap, exactly as match-core / 0176 do.
  for r in
    select i.role_id,
           count(*) filter (where not coalesce(i.is_extra_match, false)) as new_free
    from   inserted i
    group  by i.role_id
  loop
    -- A batch of only paid unlocks does not touch the free cap.
    if r.new_free = 0 then
      continue;
    end if;

    -- Serialise concurrent inserts for this role so the committed count below is
    -- authoritative (advisory lock released automatically at transaction end).
    perform pg_advisory_xact_lock(hashtext('matchgen'), hashtext(r.role_id::text));

    -- Committed active matches for the role, EXCLUDING this statement's own rows
    -- (which are already visible in the table in an AFTER trigger).
    select count(*) into v_committed
    from   public.matches m
    where  m.role_id = r.role_id
      and  m.status in (
             'pending_approval','generated','viewed','accepted_by_talent',
             'invited_by_manager','hr_scheduling','interview_scheduled',
             'interview_completed','offer_made'
           )
      and  not exists (select 1 from inserted i where i.id = m.id);

    if v_committed + r.new_free > v_cap then
      raise exception
        'MATCH_CAP_REACHED: role % would have % active matches (committed %, new %, cap %)',
        r.role_id, v_committed + r.new_free, v_committed, r.new_free, v_cap
        using errcode = 'MATCP';
    end if;
  end loop;

  return null;  -- AFTER STATEMENT trigger: return value is ignored.
end;
$$;

drop trigger if exists trg_enforce_match_cap_stmt on public.matches;
create trigger trg_enforce_match_cap_stmt
  after insert on public.matches
  referencing new table as inserted
  for each statement execute function public.enforce_match_cap_stmt();

commit;
