-- 0071: management_style_fit, urgency_fit, work_arrangement_fit
-- Adds work_arrangement_preference to talents and seeds the three new weights.

alter table talents
  add column if not exists work_arrangement_preference text
    check (work_arrangement_preference in ('on_site', 'hybrid', 'remote'));

insert into system_config (key, value)
values
  ('weight_management_style_fit', '0.07'::jsonb),
  ('weight_urgency_fit',          '0.06'::jsonb),
  ('weight_work_arrangement_fit', '0.08'::jsonb)
on conflict (key) do nothing;
