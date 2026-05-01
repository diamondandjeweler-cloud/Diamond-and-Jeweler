-- ============================================================
-- Migration 0070: Fix state machine regression + audit_log security
--
-- 1. Restore cancelled/no_show transitions that 0064 accidentally
--    dropped when it replaced validate_match_transition(). 0064 only
--    included the 0011 transitions; 0060 had added cancelled+no_show.
--
-- 2. Restrict audit_log INSERT policy — the with check (true) policy
--    allowed any authenticated user to write arbitrary audit rows from
--    the browser. Only SECURITY DEFINER triggers and service_role should
--    insert. We close the direct-insert path for the 'authenticated' role
--    by forcing it through the log_audit_event() RPC.
--
-- 3. Add missing index on company_hm_link_requests(company_id).
-- ============================================================

-- ── 1. Merge 0060 transitions back into state machine ─────────────────────

CREATE OR REPLACE FUNCTION public.validate_match_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  legal CONSTANT text[][] := ARRAY[
    -- Approval-queue (from 0064)
    ARRAY['pending_approval',    'generated'],
    ARRAY['pending_approval',    'expired'],
    -- Standard pipeline
    ARRAY['generated',           'viewed'],
    ARRAY['generated',           'expired'],
    ARRAY['viewed',              'accepted_by_talent'],
    ARRAY['viewed',              'declined_by_talent'],
    ARRAY['viewed',              'invited_by_manager'],
    ARRAY['viewed',              'expired'],
    ARRAY['accepted_by_talent',  'invited_by_manager'],
    ARRAY['accepted_by_talent',  'expired'],
    -- HM can jump directly to interview_scheduled
    ARRAY['invited_by_manager',  'interview_scheduled'],
    ARRAY['invited_by_manager',  'hr_scheduling'],
    ARRAY['invited_by_manager',  'declined_by_manager'],
    ARRAY['invited_by_manager',  'cancelled'],
    ARRAY['invited_by_manager',  'accepted_by_talent'],
    ARRAY['invited_by_manager',  'expired'],
    ARRAY['hr_scheduling',       'interview_scheduled'],
    ARRAY['hr_scheduling',       'cancelled'],
    ARRAY['hr_scheduling',       'expired'],
    ARRAY['interview_scheduled', 'interview_completed'],
    ARRAY['interview_scheduled', 'cancelled'],
    ARRAY['interview_scheduled', 'no_show'],
    ARRAY['interview_scheduled', 'expired'],
    ARRAY['interview_completed', 'offer_made'],
    ARRAY['interview_completed', 'cancelled'],
    ARRAY['interview_completed', 'hired'],
    ARRAY['interview_completed', 'expired'],
    ARRAY['offer_made',          'hired'],
    ARRAY['offer_made',          'cancelled'],
    ARRAY['offer_made',          'expired']
  ];
  pair       text[];
  is_legal   boolean := false;
  claim_role text;
BEGIN
  IF new.status IS NOT DISTINCT FROM old.status THEN RETURN new; END IF;

  claim_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');

  IF claim_role = ''             THEN RETURN new; END IF;
  IF claim_role = 'service_role' THEN RETURN new; END IF;
  IF public.is_admin()           THEN RETURN new; END IF;

  FOREACH pair SLICE 1 IN ARRAY legal LOOP
    IF pair[1] = old.status AND pair[2] = new.status THEN
      is_legal := true; EXIT;
    END IF;
  END LOOP;

  IF NOT is_legal THEN
    RAISE EXCEPTION 'Illegal match status transition: % -> %', old.status, new.status
      USING errcode = '22023';
  END IF;

  RETURN new;
END;
$$;

-- ── 2. Harden audit_log INSERT policy ─────────────────────────────────────
-- Drop the open with check (true) policy and replace with service_role-only.
-- SECURITY DEFINER triggers bypass RLS, so they still insert fine.
-- The log_audit_event() RPC is also SECURITY DEFINER, so Edge Functions work.
-- Authenticated end-users lose direct INSERT access — this is intentional.

DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;

CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT
  WITH CHECK (
    coalesce(
      (current_setting('request.jwt.claims', true)::jsonb) ->> 'role',
      ''
    ) = 'service_role'
  );

-- ── 3. Index: company_hm_link_requests(company_id) ────────────────────────
CREATE INDEX IF NOT EXISTS idx_chlr_company
  ON public.company_hm_link_requests(company_id);
