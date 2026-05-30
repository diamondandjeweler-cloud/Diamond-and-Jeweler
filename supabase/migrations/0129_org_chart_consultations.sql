-- =============================================================================
-- 0129 — Org Chart Consultant (2026-05-30)
-- =============================================================================
-- Employer-facing feature: hiring managers buy a paid "Org Chart Consultation"
-- where they upload their team roster (name + role + DOB) and DNJ returns a
-- restructured chart with role-fit recommendations, leadership clusters and
-- coaching notes.
--
-- Pricing tiers (RM, one-off per consultation, enforced by DB trigger):
--   1–5  pax  →    99       21–25 → 1,499
--   6–10 pax  →   399       26–30 → 1,999
--  11–15 pax  →   699       31–35 → 2,499
--  16–20 pax  →   999       36–40 → 2,999
--                                41–45 → 3,499
--                                46–50 → 3,999
--
-- BaZi-secrecy invariant: raw life-chart terminology stays in
-- `consultant_notes` only. Client-facing `report_html` goes through the
-- sanitiser in apps/web/src/lib/orgChartSanitiser.ts before persist.
--
-- Applied live via Management API on 2026-05-30. This file is checked in
-- for source-of-truth migration history.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) org_consultations — one row per engagement
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_consultations (
    id                          BIGSERIAL PRIMARY KEY,

    -- Client (the corporate buyer / hiring manager's company)
    client_company              TEXT NOT NULL,
    client_contact_name         TEXT,
    client_contact_email        TEXT,
    client_contact_phone        TEXT,
    client_industry             TEXT,

    -- Pricing — tier_code and price_myr are auto-stamped by trigger from team_size
    team_size                   SMALLINT NOT NULL CHECK (team_size BETWEEN 1 AND 50),
    tier_code                   TEXT NOT NULL,            -- 't1_5' | 't6_10' | ... | 't46_50'
    price_myr                   NUMERIC(10,2) NOT NULL,
    payment_status              TEXT DEFAULT 'unpaid',    -- 'unpaid' | 'paid' | 'waived'
    payment_received_at         TIMESTAMPTZ,
    payment_method              TEXT,                     -- 'cash' | 'transfer' | 'fpx' | 'card' | 'billplz' | 'other'
    payment_reference           TEXT,

    -- Lifecycle
    status                      TEXT DEFAULT 'draft',     -- 'draft' | 'collecting' | 'analyzing' | 'completed' | 'delivered'
    delivered_at                TIMESTAMPTZ,

    -- Roster — JSONB array of member objects:
    --   { name, current_role, dob, dob_time, dob_city, gender,
    --     suggested_role, fit_score, archetype_code, notes }
    members                     JSONB DEFAULT '[]'::jsonb,

    -- Pairwise compatibility — JSONB array:
    --   { from_idx, to_idx, score, code }
    pairs                       JSONB DEFAULT '[]'::jsonb,

    -- Analysis output — JSONB:
    --   { leadership_cluster: [idx],
    --     conflict_pairs: [{a, b, severity}],
    --     missing_archetypes: [code],
    --     overall_summary, generated_at }
    analysis                    JSONB DEFAULT '{}'::jsonb,

    -- Client-facing report (sanitised — no 八字 / BaZi / life-chart language).
    report_html                 TEXT,
    report_generated_at         TIMESTAMPTZ,

    -- Internal consultant notes — raw terminology OK here.
    consultant_notes            TEXT,

    -- Ownership (stored as BIGINT for v1 — not FK'd to profiles.id since
    -- DNJ profiles use UUID. Future migration may add a profile_uuid column).
    consultant_id               BIGINT,
    created_by                  BIGINT,
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_consultations_status_idx
    ON public.org_consultations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS org_consultations_consultant_idx
    ON public.org_consultations (consultant_id);
CREATE INDEX IF NOT EXISTS org_consultations_company_idx
    ON public.org_consultations (client_company);
CREATE INDEX IF NOT EXISTS org_consultations_payment_idx
    ON public.org_consultations (payment_status, created_at DESC);

-- =============================================================================
-- Row Level Security — open `authenticated` for v1; tighten per role in 0130.
-- =============================================================================
ALTER TABLE public.org_consultations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_consultations_auth_full_access" ON public.org_consultations;
CREATE POLICY "org_consultations_auth_full_access"
    ON public.org_consultations FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

GRANT ALL ON public.org_consultations TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.org_consultations_id_seq TO authenticated;

-- =============================================================================
-- updated_at trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_org_consultations()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_consultations_updated_at ON public.org_consultations;
CREATE TRIGGER trg_org_consultations_updated_at
    BEFORE UPDATE ON public.org_consultations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_org_consultations();

-- =============================================================================
-- Tier validation trigger — auto-stamps tier_code + price_myr from team_size
-- =============================================================================
CREATE OR REPLACE FUNCTION public.validate_org_consultation_tier()
RETURNS TRIGGER AS $$
DECLARE
    expected_tier  TEXT;
    expected_price NUMERIC(10,2);
BEGIN
    IF NEW.team_size BETWEEN  1 AND  5 THEN expected_tier := 't1_5';   expected_price :=    99.00;
    ELSIF NEW.team_size BETWEEN  6 AND 10 THEN expected_tier := 't6_10';  expected_price :=   399.00;
    ELSIF NEW.team_size BETWEEN 11 AND 15 THEN expected_tier := 't11_15'; expected_price :=   699.00;
    ELSIF NEW.team_size BETWEEN 16 AND 20 THEN expected_tier := 't16_20'; expected_price :=   999.00;
    ELSIF NEW.team_size BETWEEN 21 AND 25 THEN expected_tier := 't21_25'; expected_price :=  1499.00;
    ELSIF NEW.team_size BETWEEN 26 AND 30 THEN expected_tier := 't26_30'; expected_price :=  1999.00;
    ELSIF NEW.team_size BETWEEN 31 AND 35 THEN expected_tier := 't31_35'; expected_price :=  2499.00;
    ELSIF NEW.team_size BETWEEN 36 AND 40 THEN expected_tier := 't36_40'; expected_price :=  2999.00;
    ELSIF NEW.team_size BETWEEN 41 AND 45 THEN expected_tier := 't41_45'; expected_price :=  3499.00;
    ELSIF NEW.team_size BETWEEN 46 AND 50 THEN expected_tier := 't46_50'; expected_price :=  3999.00;
    ELSE
        RAISE EXCEPTION 'team_size % out of supported range (1–50)', NEW.team_size;
    END IF;

    IF NEW.tier_code IS NULL OR NEW.tier_code = '' THEN
        NEW.tier_code := expected_tier;
    END IF;
    IF NEW.price_myr IS NULL OR NEW.price_myr = 0 THEN
        NEW.price_myr := expected_price;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_consultations_validate_tier ON public.org_consultations;
CREATE TRIGGER trg_org_consultations_validate_tier
    BEFORE INSERT OR UPDATE OF team_size ON public.org_consultations
    FOR EACH ROW EXECUTE FUNCTION public.validate_org_consultation_tier();
