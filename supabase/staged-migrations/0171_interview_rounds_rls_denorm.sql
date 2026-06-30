-- 0171_interview_rounds_rls_denorm.sql
--
-- ############################################################################
-- # **OUTAGE-CLASS RLS CHANGE — PROVE THE DENY-SUITE ON A SHADOW DB BEFORE  #
-- #   LIVE APPLY; PICK THE NEXT FREE MIGRATION NUMBER; RLS REGRESSIONS HERE  #
-- #   CAUSED PRIOR 503s.**                                                   #
-- ############################################################################
--
-- STATUS: STAGED. NOT a production migration yet. It lives under
--   supabase/staged-migrations/ on purpose. Before it ships:
--     1. Renumber it to the next FREE number in supabase/migrations/.
--        As of authoring the highest applied is 0169, so the next free
--        number is 0170 (this file is named 0171 only as a staging tag —
--        DO NOT assume 0170/0171 is still free at apply time; re-check).
--     2. Apply it on a SHADOW copy of prod (`supabase db reset` against a
--        branch DB, or a Postgres restored from a prod dump).
--     3. Run the companion deny-suite
--        (0171_interview_rounds_rls_denorm.deny-suite.sql) on that shadow DB
--        and confirm EVERY assertion passes.
--     4. Only then move it into supabase/migrations/ and apply to live.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS CHANGES (B4)
-- ----------------------------------------------------------------------------
-- The interview_rounds SELECT policies (0060) call:
--     public.is_hm_for_match(match_id)      -- matches→roles→hiring_managers
--     public.is_talent_for_match(match_id)  -- matches→talents
-- Both are SECURITY DEFINER but NOT marked STABLE, and each runs a multi-table
-- correlated EXISTS. Under RLS, a non-STABLE function in a USING clause is
-- re-evaluated PER ROW returned by the scan, so a hiring manager paging their
-- interview rounds triggers one 2–3 table join per candidate row. This is the
-- exact correlated-subquery-per-row pathology that 0124 fixed for `interviews`
-- (auth_hr_company_id) and 0015 fixed for the match tables.
--
-- FIX: denormalize the two auth identities onto interview_rounds as plain,
-- indexed uuid columns, then make the SELECT policies a single indexed compare:
--     USING (match_hm_profile_id     = (select auth.uid()))   -- HM policy
--     USING (match_talent_profile_id = (select auth.uid()))   -- talent policy
-- `(select auth.uid())` is wrapped in a scalar subselect so the planner treats
-- it as an InitPlan — evaluated ONCE per statement, not per row (the standard
-- Supabase RLS performance idiom).
--
-- ----------------------------------------------------------------------------
-- WHY DENORM IS SAFE HERE (immutability argument)
-- ----------------------------------------------------------------------------
-- The denormalized identities are derived from the round's match:
--     match_hm_profile_id     = matches.role_id  → roles.hiring_manager_id
--                                → hiring_managers.profile_id
--     match_talent_profile_id = matches.talent_id → talents.profile_id
-- A `matches` row's role_id and talent_id are set at insert and are NEVER
-- updated anywhere in the codebase — the only mutable column on `matches` is
-- `status` (guarded by validate_match_transition, 0060). matches has a UNIQUE
-- (role_id, talent_id) and both FKs are NOT NULL. talents.profile_id and
-- hiring_managers.profile_id are each `unique not null` (0001). So for a given
-- match the (HM profile, talent profile) pair is fixed for the life of the
-- match. interview_rounds rows are always created under that fixed match.
-- Therefore the denormalized columns can be populated once at insert and never
-- need maintenance — there is no UPDATE path that can stale them.
--
-- EDGE NOTE (documented, mitigated): the HM identity passes through
-- roles.hiring_manager_id, which is column-level mutable in principle (a role
-- could be re-assigned to another HM). No code path does this today, and the
-- product treats a posted role as owned by one HM. If role re-assignment is
-- ever introduced, this denorm MUST be revisited (re-backfill + a roles trigger
-- to propagate). The deny-suite asserts the happy path; reassignment is out of
-- scope and explicitly flagged here.
--
-- ----------------------------------------------------------------------------
-- WRITE POLICIES (INSERT / UPDATE) — UNCHANGED ON PURPOSE
-- ----------------------------------------------------------------------------
-- ir_insert_hm / ir_update_hm keep using is_hm_for_match(). Rationale:
--   * INSERT/UPDATE policies are evaluated for ONE row (the row being written),
--     so the per-row re-evaluation cost that motivates this change does not
--     apply — there is no scan fan-out to amplify.
--   * The INSERT path is exactly where the denorm columns get populated by the
--     trigger; we must NOT require the columns to already hold the right value
--     in WITH CHECK (the client does not send them). Keeping the helper on
--     write keeps the authorization source-of-truth on the live join at the
--     moment of write, which is the strictest choice.
-- ir_admin (FOR ALL using is_admin()) is likewise unchanged.
--
-- Only the two SELECT policies are rewritten. is_hm_for_match /
-- is_talent_for_match are NOT dropped — interview_proposals (0111) still
-- depends on them.
--
-- ----------------------------------------------------------------------------
-- This whole file is idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP
-- POLICY IF EXISTS) and safe to re-run.
-- ============================================================================

BEGIN;

-- 1. Denormalized identity columns ──────────────────────────────────────────
ALTER TABLE public.interview_rounds
  ADD COLUMN IF NOT EXISTS match_hm_profile_id     uuid,
  ADD COLUMN IF NOT EXISTS match_talent_profile_id uuid;

COMMENT ON COLUMN public.interview_rounds.match_hm_profile_id IS
  'Denormalized auth profile id of the hiring manager for this round''s match '
  '(matches.role_id→roles.hiring_manager_id→hiring_managers.profile_id). '
  'Populated at INSERT by trg_ir_denorm_identities; immutable for the life of '
  'the match. Used by the ir_select_hm RLS policy as a single indexed compare.';
COMMENT ON COLUMN public.interview_rounds.match_talent_profile_id IS
  'Denormalized auth profile id of the talent for this round''s match '
  '(matches.talent_id→talents.profile_id). Populated at INSERT by '
  'trg_ir_denorm_identities; immutable for the life of the match. Used by the '
  'ir_select_talent RLS policy as a single indexed compare.';

-- 2. Backfill existing rows from the live join ──────────────────────────────
-- One pass, set-based. HM and talent resolved from the round's match.
UPDATE public.interview_rounds ir
SET    match_hm_profile_id     = hm.profile_id,
       match_talent_profile_id = t.profile_id
FROM   public.matches m
JOIN   public.roles            r  ON r.id  = m.role_id
JOIN   public.hiring_managers  hm ON hm.id = r.hiring_manager_id
JOIN   public.talents          t  ON t.id  = m.talent_id
WHERE  m.id = ir.match_id
  AND  ( ir.match_hm_profile_id     IS DISTINCT FROM hm.profile_id
      OR ir.match_talent_profile_id IS DISTINCT FROM t.profile_id );

-- 3. Indexes for the new equality predicates ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ir_match_hm_profile
  ON public.interview_rounds(match_hm_profile_id);
CREATE INDEX IF NOT EXISTS idx_ir_match_talent_profile
  ON public.interview_rounds(match_talent_profile_id);

-- 4. Insert-time population trigger (SECURITY DEFINER, search_path-safe) ─────
-- Resolves both identities from NEW.match_id so new rows are always populated
-- regardless of what (if anything) the client sends. SECURITY DEFINER so the
-- resolve join is not itself subject to RLS on matches/roles/hiring_managers/
-- talents; search_path pinned to defeat search_path injection.
CREATE OR REPLACE FUNCTION public.tg_ir_denorm_identities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_hm_profile_id     uuid;
  v_talent_profile_id uuid;
BEGIN
  SELECT hm.profile_id, t.profile_id
    INTO v_hm_profile_id, v_talent_profile_id
  FROM   public.matches m
  JOIN   public.roles            r  ON r.id  = m.role_id
  JOIN   public.hiring_managers  hm ON hm.id = r.hiring_manager_id
  JOIN   public.talents          t  ON t.id  = m.talent_id
  WHERE  m.id = NEW.match_id;

  IF NOT FOUND THEN
    -- The match must exist (interview_rounds.match_id is NOT NULL + FK), but if
    -- the join cannot resolve an HM/talent we refuse rather than silently write
    -- NULLs that would make the row invisible to its own owners.
    RAISE EXCEPTION
      'interview_rounds.match_id % does not resolve to an HM + talent identity',
      NEW.match_id
      USING ERRCODE = '23503';
  END IF;

  -- Always derive server-side; ignore any client-supplied values.
  NEW.match_hm_profile_id     := v_hm_profile_id;
  NEW.match_talent_profile_id := v_talent_profile_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_ir_denorm_identities() FROM public;

DROP TRIGGER IF EXISTS trg_ir_denorm_identities ON public.interview_rounds;
CREATE TRIGGER trg_ir_denorm_identities
  BEFORE INSERT ON public.interview_rounds
  FOR EACH ROW EXECUTE FUNCTION public.tg_ir_denorm_identities();

-- 5. Rewrite ONLY the two SELECT policies ───────────────────────────────────
-- Single indexed equality vs an InitPlan-cached auth.uid(). Behaviour is
-- equivalent to the old is_hm_for_match / is_talent_for_match checks because
-- the columns are an immutable snapshot of that exact join (see header).
DROP POLICY IF EXISTS ir_select_hm     ON public.interview_rounds;
DROP POLICY IF EXISTS ir_select_talent ON public.interview_rounds;

CREATE POLICY ir_select_hm ON public.interview_rounds
  FOR SELECT
  USING (match_hm_profile_id = (select auth.uid()));

CREATE POLICY ir_select_talent ON public.interview_rounds
  FOR SELECT
  USING (match_talent_profile_id = (select auth.uid()));

-- INSERT / UPDATE / admin policies are intentionally left as defined in 0060.
-- (See header "WRITE POLICIES" note.) They are re-asserted here idempotently
-- so a fresh shadow DB that applied 0060 keeps identical write behaviour even
-- if this file is run standalone.
DROP POLICY IF EXISTS ir_insert_hm ON public.interview_rounds;
CREATE POLICY ir_insert_hm ON public.interview_rounds
  FOR INSERT WITH CHECK (
    public.is_hm_for_match(match_id)
    AND EXISTS (
      SELECT 1 FROM public.matches
      WHERE  id = match_id
        AND  status IN ('invited_by_manager','interview_scheduled')
    )
  );

DROP POLICY IF EXISTS ir_update_hm ON public.interview_rounds;
CREATE POLICY ir_update_hm ON public.interview_rounds
  FOR UPDATE USING (public.is_hm_for_match(match_id));

DROP POLICY IF EXISTS ir_admin ON public.interview_rounds;
CREATE POLICY ir_admin ON public.interview_rounds
  FOR ALL USING (public.is_admin());

COMMIT;

-- ----------------------------------------------------------------------------
-- POST-APPLY VERIFICATION (run by hand on the shadow DB)
-- ----------------------------------------------------------------------------
-- a) No NULL identities left after backfill (every round must be owner-visible):
--      SELECT count(*) FROM public.interview_rounds
--      WHERE match_hm_profile_id IS NULL OR match_talent_profile_id IS NULL;
--    -> expect 0.
-- b) Denorm matches the live join for every row (drift check):
--      SELECT count(*) FROM public.interview_rounds ir
--      JOIN public.matches m            ON m.id  = ir.match_id
--      JOIN public.roles r              ON r.id  = m.role_id
--      JOIN public.hiring_managers hm   ON hm.id = r.hiring_manager_id
--      JOIN public.talents t            ON t.id  = m.talent_id
--      WHERE ir.match_hm_profile_id     <> hm.profile_id
--         OR ir.match_talent_profile_id <> t.profile_id;
--    -> expect 0.
-- c) Then run 0171_interview_rounds_rls_denorm.deny-suite.sql — all PASS.
