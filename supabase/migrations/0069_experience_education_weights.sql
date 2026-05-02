-- 0069_experience_education_weights.sql
--
-- Adds experience_fit and education_fit scoring weights to system_config
-- so they can be tuned via admin dashboard without code changes.

insert into public.system_config (key, value)
values
  ('weight_experience_fit', '0.08'::jsonb),
  ('weight_education_fit',  '0.05'::jsonb)
on conflict (key) do nothing;
