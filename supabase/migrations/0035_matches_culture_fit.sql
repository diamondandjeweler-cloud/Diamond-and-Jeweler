-- Store the culture-fit dimension score separately so it can be queried / displayed.
alter table public.matches
  add column if not exists culture_fit_score numeric(5,2);

-- Seed the weight for the new culture-fit dimension.
-- Dynamic normalisation in match-generate means the existing weight_tag_compatibility
-- and weight_life_chart values stay unchanged; culture is additive.
insert into public.system_config (key, value)
values ('weight_culture_fit', '0.2'::jsonb)
on conflict (key) do nothing;
