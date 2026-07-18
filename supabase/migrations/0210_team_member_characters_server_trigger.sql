-- =============================================================================
-- 0210 — derive roles.team_member_characters server-side (closes H5 for the
--        post-role team-dynamics path)                            (2026-07-18)
-- =============================================================================
-- H5 (security audit): the life-chart character algorithm shipped in the public
-- JS bundle. 0198/0208 moved the talents/hiring_managers derivation to a
-- server-side trigger; this migration closes the LAST client caller —
-- PostRole's team-dynamics section, which computed roles.team_member_characters
-- from each reference colleague's (birth-year, gender) via the same client
-- algorithm (apps/web/.../postrole/teamCharacters.ts).
--
-- FIX: add a raw-input column roles.team_member_inputs (jsonb array of
-- {"y": <birth year int>, "g": "male"|"female"}) that the post-0210 client
-- sends instead of the computed characters, and a BEFORE INSERT/UPDATE trigger
-- that derives team_member_characters from it using the already-deployed
-- SECURITY DEFINER public.compute_life_chart_character (0198) — whose EXECUTE is
-- revoked from anon/authenticated, so the algorithm stays server-only.
--
-- Mirrors teamCharacters.ts semantics EXACTLY: each colleague's DOB is the
-- year at July 1 (m>2 → solar year = calendar year), bounds 1950–2100, invalid
-- rows skipped, empty result → NULL (the matcher treats NULL as "no team fit").
--
-- BACKWARD-COMPATIBLE: the trigger only derives when team_member_inputs is a
-- non-empty array. The pre-0210 client sends team_member_characters directly
-- and no team_member_inputs, so the trigger returns NEW untouched and its value
-- is preserved. Both clients are correct across the deploy window.
--
-- Exception-safe/fill-from-inputs: any error leaves team_member_characters
-- as-supplied and never blocks the roles insert/update. Logs SQLSTATE only
-- (never SQLERRM) so a bad cast cannot embed input data in the server log.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF
-- EXISTS. Author-only — owner must apply.
--
-- ROLLBACK:
--   drop trigger if exists trg_roles_fill_team_member_characters on public.roles;
--   drop function if exists public.trg_fill_team_member_characters();
--   alter table public.roles drop column if exists team_member_inputs;
-- =============================================================================

alter table public.roles
  add column if not exists team_member_inputs jsonb;

comment on column public.roles.team_member_inputs is
  'Raw team-dynamic reference inputs: jsonb array of {"y":<birth year int>,"g":"male"|"female"}. '
  'The 0210 trigger derives team_member_characters from this server-side (H5). Null on legacy rows.';

create or replace function public.trg_fill_team_member_characters()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_chars  text[];
  v_elem   jsonb;
  v_year   int;
  v_gender text;
  v_char   text;
begin
  -- Derive ONLY when the client supplied raw inputs; otherwise leave
  -- team_member_characters exactly as provided (pre-0210 client compatibility).
  if new.team_member_inputs is null
     or jsonb_typeof(new.team_member_inputs) <> 'array'
     or jsonb_array_length(new.team_member_inputs) = 0 then
    return new;
  end if;

  begin
    v_chars := array[]::text[];
    for v_elem in select value from jsonb_array_elements(new.team_member_inputs)
    loop
      -- Skip malformed rows (matches teamCharacters.ts filter semantics).
      continue when jsonb_typeof(v_elem -> 'y') <> 'number';
      v_year   := (v_elem ->> 'y')::int;
      v_gender := v_elem ->> 'g';
      continue when v_year < 1950 or v_year > 2100;
      continue when v_gender is null or v_gender not in ('male', 'female');

      -- July 1 → m>2 → solar year = calendar year (same as `${year}-07-01`).
      v_char := public.compute_life_chart_character(make_date(v_year, 7, 1), v_gender);
      if v_char is not null then
        v_chars := array_append(v_chars, v_char);
      end if;
    end loop;

    -- Empty → NULL (null-when-empty contract the matcher expects).
    if array_length(v_chars, 1) is null then
      new.team_member_characters := null;
    else
      new.team_member_characters := v_chars;
    end if;
  exception when others then
    raise warning 'trg_fill_team_member_characters: derivation skipped (sqlstate %)', sqlstate;
    -- leave team_member_characters as-is on any error; never block the write.
  end;

  return new;
end;
$$;

revoke all on function public.trg_fill_team_member_characters() from public;

drop trigger if exists trg_roles_fill_team_member_characters on public.roles;
create trigger trg_roles_fill_team_member_characters
  before insert or update on public.roles
  for each row
  execute function public.trg_fill_team_member_characters();

comment on function public.trg_fill_team_member_characters() is
  'Derives roles.team_member_characters from roles.team_member_inputs server-side '
  '(compute_life_chart_character, 0198). Backward-compatible: no-ops when inputs are '
  'absent so the pre-0210 client that sent characters directly still works. Added by 0210 (H5).';
