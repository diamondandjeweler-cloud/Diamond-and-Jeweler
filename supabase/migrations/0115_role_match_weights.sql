-- 0115_role_match_weights.sql
--
-- Seeds new scoring weights for the dimensions added by 0112+0114.
-- Existing weights stay untouched; renormalisation in match-core handles
-- summing to 1.0 so legacy roles keep scoring the same.
--
-- New dimensions (proposed defaults — tune via admin dashboard):
--   weight_skill_match            0.10  — primary new signal
--   weight_language_match         0.06
--   weight_environment_match      0.03
--   weight_open_to_match          0.03
--   weight_schedule_match         0.04
--   weight_probation_comfort      0.02
--   weight_concerns_alignment     0.05  — NN atom satisfaction rate

insert into public.system_config (key, value) values
  ('weight_skill_match',         '0.10'::jsonb),
  ('weight_language_match',      '0.06'::jsonb),
  ('weight_environment_match',   '0.03'::jsonb),
  ('weight_open_to_match',       '0.03'::jsonb),
  ('weight_schedule_match',      '0.04'::jsonb),
  ('weight_probation_comfort',   '0.02'::jsonb),
  ('weight_concerns_alignment',  '0.05'::jsonb)
on conflict (key) do nothing;
