-- Migration 0122: Allow viewed → declined_by_manager transition
--
-- The state machine only allowed declined_by_manager from invited_by_manager,
-- but the HM dashboard shows a Decline button for candidates in 'viewed' state.
-- Attempting to click it produced "Illegal match status transition: viewed →
-- declined_by_manager". Adding the missing transition so HMs can decline without
-- having to invite first.

CREATE OR REPLACE FUNCTION public.validate_match_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  legal CONSTANT text[][] := ARRAY[
    -- Approval-queue
    ARRAY['pending_approval',    'generated'],
    ARRAY['pending_approval',    'expired'],
    -- Standard pipeline
    ARRAY['generated',           'viewed'],
    ARRAY['generated',           'expired'],
    ARRAY['viewed',              'accepted_by_talent'],
    ARRAY['viewed',              'declined_by_talent'],
    ARRAY['viewed',              'invited_by_manager'],
    ARRAY['viewed',              'declined_by_manager'],   -- ← added
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
