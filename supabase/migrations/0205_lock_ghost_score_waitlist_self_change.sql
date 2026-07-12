-- =============================================================================
-- 0205 — talent can self-lower ghost_score (rank manipulation) and self-set
--        waitlist_approved via profiles UPDATE (MED, finding auth-rls-3)
--                                                                    (2026-07-13)
-- =============================================================================
-- 0187:27-28 re-grants column UPDATE(ghost_score) and UPDATE(waitlist_approved)
-- to `authenticated`; profiles_update_self WITH CHECK constrains only
-- auth.uid()/role/is_banned, and no trigger guards these columns. So a talent can
--   supabase.from('profiles').update({ ghost_score: <n> }).eq('id', uid)
-- ghost_score is a system-computed anti-ghosting penalty consumed by the matcher
-- (match-scoring.ts ghostPenalty / pShow), so a talent setting a NEGATIVE or
-- otherwise-arbitrary value inverts the penalty into a rank BONUS over honest
-- candidates. The same grant lets a talent flip their own waitlist_approved=true.
--
-- FIX (mirrors prevent_role_self_change 0069 / prevent_company_id_self_change
-- 0184): a BEFORE UPDATE trigger that reverts self-changes by a non-admin /
-- non-service_role caller. Column grants stay in place (same pattern as 0184/0186
-- — the trigger is the source of truth).
--
--   * waitlist_approved — system/admin only: any self-change is reverted.
--   * ghost_score       — PERMIT only a reset-to-zero, revert every other value.
--       The self-service Revive flow
--       (useTalentDashboardData.tsx:362 → updateProfile({ ghost_score: 0 }))
--       legitimately clears the score to 0 from the authenticated client, and
--       Revive is an at-will action — so clearing to 0 is already available and
--       is left working WITHOUT any apps/web change. Reverting every NON-zero
--       self-change closes the strictly-worse vectors this finding is about
--       (negative → rank bonus, or an arbitrary chosen value) while system
--       award/penalty jobs (service_role) and admins retain full write.
--
-- FOLLOW-UP (out of scope for this migration-only batch): to also stop the
-- at-will self-clear-to-0, move the Revive reset behind a SECURITY DEFINER RPC
-- that validates revive-eligibility, repoint reviveProfile() at it, and then
-- tighten this trigger to revert the ghost_score reset-to-zero exception too.
--
-- Idempotent: create or replace function / drop trigger if exists. Author-only —
-- owner must apply. Deny coverage added in supabase/tests/rls_deny.sql
-- (INVARIANT 12).
--
-- ROLLBACK:
--   drop trigger if exists trg_prevent_ghost_waitlist_self_change on public.profiles;
--   drop function if exists public.prevent_ghost_waitlist_self_change();
-- =============================================================================

create or replace function public.prevent_ghost_waitlist_self_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_privileged boolean;
begin
  v_privileged := public.is_admin()
    or coalesce(
         (current_setting('request.jwt.claims', true)::jsonb) ->> 'role',
         ''
       ) = 'service_role';
  if v_privileged then
    return new;
  end if;

  -- waitlist_approved: system/admin-controlled — revert any self-change.
  if new.waitlist_approved is distinct from old.waitlist_approved then
    new.waitlist_approved := old.waitlist_approved;
  end if;

  -- ghost_score: allow ONLY a reset-to-zero (the at-will Revive clear); revert
  -- every other self-change (blocks negative/arbitrary rank manipulation).
  if new.ghost_score is distinct from old.ghost_score
     and new.ghost_score is distinct from 0 then
    new.ghost_score := old.ghost_score;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_ghost_waitlist_self_change on public.profiles;
create trigger trg_prevent_ghost_waitlist_self_change
  before update on public.profiles
  for each row
  execute function public.prevent_ghost_waitlist_self_change();
