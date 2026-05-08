-- ============================================================
-- 0090 — AI moderation for role postings (illegal-business detection)
--
-- Adds compliance gating to public.roles so jobs that look like MLM/pyramid
-- schemes, money-muling, drug fronts, sex-work-disguised-as-modeling,
-- advance-fee scams, unlicensed financial services, underage hiring, or visa
-- fraud are flagged before they appear in matching.
--
-- Flow:
--   1. Employer inserts a role  →  trigger sets moderation_status='pending'
--      and clamps roles.status to 'paused' so it stays out of matching.
--   2. Edge Function `moderate-role` runs a keyword prefilter then (if
--      needed) an LLM classifier, writing back:
--          moderation_status   = approved | flagged | rejected
--          moderation_score    = 0..100  (higher = riskier)
--          moderation_category = pyramid_mlm | money_muling | drugs |
--                                sex_work | advance_fee_scam |
--                                unlicensed_finance | underage |
--                                visa_fraud | other_illegal | clean
--          moderation_reason   = short human-readable explanation
--   3. On 'approved' the trigger restores roles.status='active'.
--   4. 'flagged' rows surface in the admin moderation queue panel.
--   5. 'rejected' rows can be appealed by the employer; appeal kicks the row
--      back to 'flagged' for human review.
-- ============================================================

-- ---------- columns on roles ----------

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending','approved','flagged','rejected')),
  ADD COLUMN IF NOT EXISTS moderation_score int
    CHECK (moderation_score IS NULL OR (moderation_score BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS moderation_category text,
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS moderation_provider text,
  ADD COLUMN IF NOT EXISTS moderation_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_appeal_text text,
  ADD COLUMN IF NOT EXISTS moderation_appealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_reviewed_at timestamptz;

-- Existing rows pre-date moderation — backfill them as approved so they
-- aren't yanked out of matching when this migration runs.
UPDATE public.roles
   SET moderation_status   = 'approved',
       moderation_category = 'clean',
       moderation_score    = 0,
       moderation_reason   = 'pre-moderation backfill',
       moderation_checked_at = now()
 WHERE moderation_status = 'pending'
   AND created_at < now();

CREATE INDEX IF NOT EXISTS idx_roles_moderation_status
  ON public.roles (moderation_status, created_at DESC)
  WHERE moderation_status IN ('pending','flagged','rejected');

COMMENT ON COLUMN public.roles.moderation_status IS
  'AI compliance gate. Roles only enter matching when status=approved.';

-- ---------- moderation event log ----------

CREATE TABLE IF NOT EXISTS public.role_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'auto_approved','keyword_block','llm_flagged','llm_rejected',
      'admin_approved','admin_rejected','employer_appealed','rechecked'
    )),
  prev_status text,
  new_status text,
  score int,
  category text,
  reason text,
  provider text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_moderation_events_role
  ON public.role_moderation_events (role_id, created_at DESC);

ALTER TABLE public.role_moderation_events ENABLE ROW LEVEL SECURITY;

-- Admins see everything.
CREATE POLICY rme_select_admin ON public.role_moderation_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- The hiring manager who owns the role can see its history (for appeal context).
CREATE POLICY rme_select_owner ON public.role_moderation_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM public.roles r
        JOIN public.hiring_managers hm ON hm.id = r.hiring_manager_id
       WHERE r.id = role_moderation_events.role_id
         AND hm.profile_id = auth.uid()
    )
  );

-- Inserts only via service role / triggers — no client writes.

-- ---------- gate roles_select_talent_via_match on approval ----------
-- A talent must never see a role that hasn't passed moderation, even if a
-- match row was somehow created. match-generate already gates on status, but
-- defense-in-depth at the RLS layer matters.

DROP POLICY IF EXISTS roles_select_talent_via_match ON public.roles;

CREATE POLICY roles_select_talent_via_match ON public.roles
  FOR SELECT USING (
    moderation_status = 'approved'
    AND EXISTS (
      SELECT 1
        FROM public.matches m
        JOIN public.talents t ON t.id = m.talent_id
       WHERE m.role_id = roles.id AND t.profile_id = auth.uid()
    )
  );

-- ---------- triggers ----------

-- On insert: force pending + paused so the row is invisible to matching
-- until moderation runs. Employers see it as "Under review" via the
-- moderation_status column.
CREATE OR REPLACE FUNCTION public.tg_roles_moderation_on_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Service role / admin can bypass (e.g. data import, test seed).
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.moderation_status := 'pending';
  NEW.moderation_score  := NULL;
  NEW.moderation_category := NULL;
  NEW.moderation_reason := NULL;
  NEW.moderation_provider := NULL;
  NEW.moderation_checked_at := NULL;
  NEW.moderation_attempts := 0;

  -- Hold the role out of matching until approved. Preserve 'paused' if the
  -- HM explicitly chose to draft-paused.
  IF NEW.status = 'active' THEN
    NEW.status := 'paused';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_roles_moderation_insert ON public.roles;
CREATE TRIGGER tg_roles_moderation_insert
  BEFORE INSERT ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_roles_moderation_on_insert();

-- On moderation status flip → approved: lift the matching freeze if the HM
-- hasn't paused/filled the role in the meantime.
CREATE OR REPLACE FUNCTION public.tg_roles_moderation_on_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.moderation_status = 'approved'
     AND OLD.moderation_status <> 'approved'
     AND NEW.status = 'paused' THEN
    NEW.status := 'active';
  END IF;

  -- If moderation flips away from approved (e.g. admin rejected after a
  -- recheck), pause matching immediately.
  IF OLD.moderation_status = 'approved'
     AND NEW.moderation_status IN ('flagged','rejected')
     AND NEW.status = 'active' THEN
    NEW.status := 'paused';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_roles_moderation_update ON public.roles;
CREATE TRIGGER tg_roles_moderation_update
  BEFORE UPDATE OF moderation_status ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_roles_moderation_on_update();

-- ---------- employer appeal RPC ----------
-- An employer can appeal a flagged or rejected role exactly once per
-- decision; this re-queues the row for admin review. Limiting to one open
-- appeal at a time prevents spam.
CREATE OR REPLACE FUNCTION public.appeal_role_moderation(
  p_role_id uuid,
  p_appeal_text text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_profile uuid;
  v_status text;
  v_already_appealed boolean;
BEGIN
  IF p_appeal_text IS NULL OR length(trim(p_appeal_text)) < 10 THEN
    RAISE EXCEPTION 'Appeal must include at least 10 characters explaining the role.';
  END IF;
  IF length(p_appeal_text) > 2000 THEN
    RAISE EXCEPTION 'Appeal too long (max 2000 chars).';
  END IF;

  SELECT hm.profile_id, r.moderation_status,
         (r.moderation_appealed_at IS NOT NULL
          AND r.moderation_reviewed_at IS NULL)
    INTO v_owner_profile, v_status, v_already_appealed
    FROM public.roles r
    JOIN public.hiring_managers hm ON hm.id = r.hiring_manager_id
   WHERE r.id = p_role_id;

  IF v_owner_profile IS NULL THEN
    RAISE EXCEPTION 'Role not found.';
  END IF;
  IF v_owner_profile <> auth.uid() THEN
    RAISE EXCEPTION 'Only the role owner can submit an appeal.';
  END IF;
  IF v_status NOT IN ('flagged','rejected') THEN
    RAISE EXCEPTION 'Only flagged or rejected roles can be appealed.';
  END IF;
  IF v_already_appealed THEN
    RAISE EXCEPTION 'An appeal is already pending review.';
  END IF;

  UPDATE public.roles
     SET moderation_appeal_text  = p_appeal_text,
         moderation_appealed_at  = now(),
         moderation_status       = 'flagged',  -- always lands in the queue
         moderation_reviewed_by  = NULL,
         moderation_reviewed_at  = NULL
   WHERE id = p_role_id;

  INSERT INTO public.role_moderation_events
    (role_id, event_type, prev_status, new_status, reason, actor_id, metadata)
  VALUES
    (p_role_id, 'employer_appealed', v_status, 'flagged',
     left(p_appeal_text, 500), auth.uid(),
     jsonb_build_object('appeal_length', length(p_appeal_text)));
END $$;

REVOKE ALL ON FUNCTION public.appeal_role_moderation(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.appeal_role_moderation(uuid, text) TO authenticated;

-- ---------- admin decision RPC ----------
-- Used by the admin queue panel. Service role can also call it directly
-- (e.g. from the Edge Function on the auto-approve path).
CREATE OR REPLACE FUNCTION public.admin_decide_role_moderation(
  p_role_id uuid,
  p_decision text,           -- 'approved' | 'rejected'
  p_reason text DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role_role text;
  v_prev_status text;
  v_is_admin boolean;
  v_is_service boolean;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected.';
  END IF;

  v_is_service := current_setting('request.jwt.claim.role', true) = 'service_role';

  IF NOT v_is_service THEN
    SELECT (p.role = 'admin') INTO v_is_admin
      FROM public.profiles p WHERE p.id = auth.uid();
    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'Forbidden: admin only.';
    END IF;
  END IF;

  SELECT moderation_status INTO v_prev_status
    FROM public.roles WHERE id = p_role_id;
  IF v_prev_status IS NULL THEN
    RAISE EXCEPTION 'Role not found.';
  END IF;

  UPDATE public.roles
     SET moderation_status   = p_decision,
         moderation_reason   = COALESCE(p_reason, moderation_reason),
         moderation_category = COALESCE(p_category, moderation_category),
         moderation_reviewed_by = CASE WHEN v_is_service THEN NULL ELSE auth.uid() END,
         moderation_reviewed_at = now(),
         moderation_checked_at  = now()
   WHERE id = p_role_id;

  INSERT INTO public.role_moderation_events
    (role_id, event_type, prev_status, new_status, reason, category, actor_id)
  VALUES
    (p_role_id,
     CASE WHEN p_decision = 'approved' THEN 'admin_approved' ELSE 'admin_rejected' END,
     v_prev_status, p_decision, p_reason, p_category,
     CASE WHEN v_is_service THEN NULL ELSE auth.uid() END);
END $$;

REVOKE ALL ON FUNCTION public.admin_decide_role_moderation(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_decide_role_moderation(uuid, text, text, text) TO authenticated;
