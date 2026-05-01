-- ============================================================
-- BoLe Platform — Interview rounds, contact reveal, state machine update
-- ============================================================

-- 1. interview_rounds table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_rounds (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid        NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  round_number    int         NOT NULL DEFAULT 1,
  scheduled_at    timestamptz NOT NULL,
  interview_url   text        NOT NULL,
  interview_token uuid        NOT NULL DEFAULT gen_random_uuid(),
  status          text        NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  hm_notes        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ir_match ON public.interview_rounds(match_id);

-- auto-updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tg_ir_updated_at ON public.interview_rounds;
CREATE TRIGGER tg_ir_updated_at
  BEFORE UPDATE ON public.interview_rounds
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. New columns on matches ──────────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS interview_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_made_at          timestamptz;

-- 3. Expand matches.status to include cancelled / no_show ───
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_status_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_status_check CHECK (status IN (
    'generated','viewed',
    'accepted_by_talent','declined_by_talent',
    'invited_by_manager','declined_by_manager',
    'hr_scheduling',
    'interview_scheduled','interview_completed',
    'offer_made','hired','expired',
    'cancelled','no_show'
  ));

-- 4. Update state-machine transition table ──────────────────
CREATE OR REPLACE FUNCTION public.validate_match_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  legal CONSTANT text[][] := ARRAY[
    ARRAY['generated',           'viewed'],
    ARRAY['generated',           'expired'],
    ARRAY['viewed',              'accepted_by_talent'],
    ARRAY['viewed',              'declined_by_talent'],
    ARRAY['viewed',              'invited_by_manager'],
    ARRAY['viewed',              'expired'],
    ARRAY['accepted_by_talent',  'invited_by_manager'],
    ARRAY['accepted_by_talent',  'expired'],
    -- HM can jump directly to interview_scheduled (skip hr_scheduling)
    ARRAY['invited_by_manager',  'interview_scheduled'],
    ARRAY['invited_by_manager',  'hr_scheduling'],
    ARRAY['invited_by_manager',  'declined_by_manager'],
    ARRAY['invited_by_manager',  'cancelled'],
    ARRAY['invited_by_manager',  'accepted_by_talent'],
    ARRAY['invited_by_manager',  'expired'],
    ARRAY['hr_scheduling',       'interview_scheduled'],
    ARRAY['hr_scheduling',       'cancelled'],
    ARRAY['hr_scheduling',       'expired'],
    -- interview_scheduled stays as-is while rounds are added;
    -- HM marks done → interview_completed; either party can cancel
    ARRAY['interview_scheduled', 'interview_completed'],
    ARRAY['interview_scheduled', 'cancelled'],
    ARRAY['interview_scheduled', 'no_show'],
    ARRAY['interview_scheduled', 'expired'],
    ARRAY['interview_completed', 'offer_made'],
    ARRAY['interview_completed', 'cancelled'],
    ARRAY['interview_completed', 'hired'],   -- shortcut for admin/HR
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
      USING ERRCODE = '22023';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_match_transition ON public.matches;
CREATE TRIGGER trg_validate_match_transition
  BEFORE UPDATE OF status ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.validate_match_transition();

-- 5. RLS for interview_rounds ────────────────────────────────
ALTER TABLE public.interview_rounds ENABLE ROW LEVEL SECURITY;

-- Helper: is calling user the HM for this match?
CREATE OR REPLACE FUNCTION public.is_hm_for_match(p_match_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   matches m
    JOIN   roles r  ON r.id  = m.role_id
    JOIN   hiring_managers hm ON hm.id = r.hiring_manager_id
    WHERE  m.id = p_match_id
      AND  hm.profile_id = auth.uid()
  );
$$;

-- Helper: is calling user the talent for this match?
CREATE OR REPLACE FUNCTION public.is_talent_for_match(p_match_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   matches m
    JOIN   talents t ON t.id = m.talent_id
    WHERE  m.id = p_match_id
      AND  t.profile_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS ir_select_hm      ON public.interview_rounds;
DROP POLICY IF EXISTS ir_select_talent  ON public.interview_rounds;
DROP POLICY IF EXISTS ir_insert_hm      ON public.interview_rounds;
DROP POLICY IF EXISTS ir_update_hm      ON public.interview_rounds;
DROP POLICY IF EXISTS ir_admin          ON public.interview_rounds;

CREATE POLICY ir_select_hm ON public.interview_rounds
  FOR SELECT USING (public.is_hm_for_match(match_id));

CREATE POLICY ir_select_talent ON public.interview_rounds
  FOR SELECT USING (public.is_talent_for_match(match_id));

CREATE POLICY ir_insert_hm ON public.interview_rounds
  FOR INSERT WITH CHECK (
    public.is_hm_for_match(match_id)
    AND EXISTS (
      SELECT 1 FROM public.matches
      WHERE  id = match_id
        AND  status IN ('invited_by_manager','interview_scheduled')
    )
  );

CREATE POLICY ir_update_hm ON public.interview_rounds
  FOR UPDATE USING (public.is_hm_for_match(match_id));

CREATE POLICY ir_admin ON public.interview_rounds
  FOR ALL USING (public.is_admin());

-- 6. Contact-reveal function (SECURITY DEFINER) ─────────────
CREATE OR REPLACE FUNCTION public.get_talent_contact(p_match_id uuid)
RETURNS TABLE(full_name text, email text, phone text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_status        text;
  v_hm_profile_id uuid;
  v_talent_pid    uuid;
BEGIN
  SELECT m.status, hm.profile_id, t.profile_id
  INTO   v_status, v_hm_profile_id, v_talent_pid
  FROM   matches m
  JOIN   roles r    ON r.id  = m.role_id
  JOIN   hiring_managers hm ON hm.id = r.hiring_manager_id
  JOIN   talents t  ON t.id  = m.talent_id
  WHERE  m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_hm_profile_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized'  USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('offer_made','hired') THEN
    RAISE EXCEPTION 'Contact locked — make an offer first' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT p.full_name, p.email, p.phone
    FROM   profiles p
    WHERE  p.id = v_talent_pid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_talent_contact(uuid) TO authenticated;

-- 7. Notifications type constraint update ───────────────────
-- Attempt to expand notifications.type if a check constraint exists.
-- If there is no such constraint this block is a no-op.
DO $$
BEGIN
  ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check CHECK (type IN (
      'match_ready','hm_invited','candidate_invited',
      'interview_scheduled','match_expiring','match_no_action_48h',
      'company_verified','dsr_export_ready',
      -- new in 0060:
      'interview_round_scheduled','interview_cancelled',
      'offer_made_notify','offer_accepted','offer_declined'
    ));
EXCEPTION WHEN undefined_table THEN
  NULL; -- notifications table might not exist yet
END;
$$;
