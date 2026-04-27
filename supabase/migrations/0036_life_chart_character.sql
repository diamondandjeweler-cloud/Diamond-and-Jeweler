-- ============================================================
-- BoLe Platform — Life-chart character (gender-aware year mapping)
--
-- Adds gender + life_chart_character columns to talents and
-- hiring_managers. The character is one of nine codes (E, W, F,
-- E+, E-, W+, W-, G+, G-) computed at onboarding from DOB + gender
-- using the solar-year boundary table in
-- apps/web/src/lib/lifeChartCharacter.ts.
--
-- Stored in plaintext: this is a deterministic 9-year cycle keyed
-- off Li Chun (3-5 February). The match-engine uses it as one input
-- to compute compatibility — the proprietary scoring formula remains
-- in the bazi-score Edge Function.
-- ============================================================

alter table public.talents
  add column if not exists gender text,
  add column if not exists life_chart_character text;

alter table public.talents
  drop constraint if exists talents_gender_check;
alter table public.talents
  add constraint talents_gender_check
    check (gender is null or gender in ('male','female'));

alter table public.talents
  drop constraint if exists talents_life_chart_character_check;
alter table public.talents
  add constraint talents_life_chart_character_check
    check (
      life_chart_character is null
      or life_chart_character in ('E','W','F','E+','E-','W+','W-','G+','G-')
    );

alter table public.hiring_managers
  add column if not exists gender text,
  add column if not exists life_chart_character text;

alter table public.hiring_managers
  drop constraint if exists hiring_managers_gender_check;
alter table public.hiring_managers
  add constraint hiring_managers_gender_check
    check (gender is null or gender in ('male','female'));

alter table public.hiring_managers
  drop constraint if exists hiring_managers_life_chart_character_check;
alter table public.hiring_managers
  add constraint hiring_managers_life_chart_character_check
    check (
      life_chart_character is null
      or life_chart_character in ('E','W','F','E+','E-','W+','W-','G+','G-')
    );

create index if not exists idx_talents_life_chart_char
  on public.talents(life_chart_character);
create index if not exists idx_hm_life_chart_char
  on public.hiring_managers(life_chart_character);
