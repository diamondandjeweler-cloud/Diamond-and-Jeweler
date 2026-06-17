-- 0145 — Neutralise the active PDPA consent text (remove "life-chart / BaZi" leak)
--
-- Migration 0021 seeded the only active consent_versions row (v1.0-en) whose
-- body_md contains the literal phrase "(life-chart / BaZi)". Consent.tsx renders
-- that body verbatim for talents via dangerouslySetInnerHTML, so the forbidden
-- secrecy terms surface on a user-visible legal surface.
--
-- Fix: insert a NEW neutral row (v1.1-en) using the exact candidate-side copy
-- that Consent.tsx's talentBody('en') already renders (AI-powered matching, no
-- life-chart / BaZi / fortune), flip it active, and deactivate the old v1.0-en
-- row. Idempotent: re-runnable via ON CONFLICT and guarded UPDATEs.

do $$
begin
  -- 1) Insert the neutral candidate-side consent text. Matches the column set
  --    of the 0021 seed (version, language, body_md, is_active).
  insert into public.consent_versions (version, language, body_md, is_active) values
  ('v1.1-en', 'en',
'# Data Processing Consent (Candidate side)

I, the undersigned, give my **explicit consent** to DNJ ("the Platform") to collect, store, and process the following data:

- Full name, email, phone number
- National Registration Identity Card (NRIC) / Passport number
- Date of birth
- Resume and employment history
- Interview answers and job preferences

I understand that the Platform uses a **proprietary AI-powered matching algorithm** that analyses my profile to determine compatibility with potential employers. The exact methodology is a trade secret and will not be disclosed to me.

I agree that my data may be shared with potential employers solely for recruitment matching.

**I acknowledge that I have read and understood this consent.**', true)
  on conflict (version) do update
    set body_md   = excluded.body_md,
        language  = excluded.language,
        is_active = true;

  -- 2) Activate the new neutral row (covers the case where the row already
  --    existed but was previously deactivated).
  update public.consent_versions
     set is_active = true
   where version = 'v1.1-en';

  -- 3) Deactivate the old leaking row so it is no longer fetched by
  --    Consent.tsx's `.eq('is_active', true)` query.
  update public.consent_versions
     set is_active = false
   where version = 'v1.0-en';
end $$;
