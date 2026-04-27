-- ============================================================
-- BoLe Platform — DSR correction proposal column
-- Lets users attach a structured "what to correct" payload to a
-- data_requests row. Admin reviews + applies via the dsr-apply-correction
-- Edge Function, which allow-lists which fields are user-correctable.
-- ============================================================

alter table public.data_requests
  add column if not exists correction_proposal jsonb;

-- Expected shape:
--   { "items": [ { "field": "profiles.full_name", "new_value": "Ada Lovelace" },
--                { "field": "talents.expected_salary_min", "new_value": 8500 } ] }
--
-- Only fields on the allow-list in dsr-apply-correction/index.ts are applied.
-- Unknown fields are rejected and the proposal stays pending.

comment on column public.data_requests.correction_proposal is
  'User-submitted structured correction payload, applied by dsr-apply-correction Edge Function.';
