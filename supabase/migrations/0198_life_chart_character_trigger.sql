-- 0198_life_chart_character_trigger.sql
-- ============================================================================
-- B1 (H5, SAFE half) — server-side derivation of life_chart_character.
--
-- Today talents.life_chart_character / hiring_managers.life_chart_character are
-- computed in the browser (apps/web/src/shared/domain/lifeChart/
-- lifeChartCharacter.ts) and written by the client. A malicious client could
-- send a forged value. The hardening goal is for the SERVER to be the authority.
--
-- This migration ports that deterministic lookup into SQL and installs a
-- BEFORE INSERT/UPDATE trigger. The trigger is deliberately FILL-ONLY
-- (COALESCE semantics): it only derives the character when the row's
-- life_chart_character is NULL. That makes it 100% backward-compatible with the
-- CURRENT client, which always supplies the value — the trigger sees a non-null
-- value and does nothing, so applying this migration changes no observable
-- behaviour. It becomes the authority once the client stops sending the field
-- (the post-deploy cleanup recorded in docs/STAGED_DEPLOYS.md).
--
-- DOB is stored encrypted (date_of_birth_encrypted bytea, migration 0013). The
-- trigger decrypts it INTERNALLY using the same Vault passphrase + pgcrypto
-- pattern as encrypt_dob — it does NOT call the admin-gated decrypt_dob RPC
-- (which stays revoked, per governor §6). Decryption is wrapped so a bad
-- ciphertext / missing secret can NEVER abort the underlying write.
--
-- NOTE: the client algorithm is intentionally LEFT IN PLACE in this batch —
-- deleting it before this trigger is deployed would break onboarding. Removal
-- is the post-deploy step in docs/STAGED_DEPLOYS.md.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---- Pure lookup: DOB (plaintext date) + gender -> character ---------------
-- Deterministic port of lifeChartCharacter.ts. IMMUTABLE — no I/O, no secrets.
create or replace function public.compute_life_chart_character(
  p_dob    date,
  p_gender text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  -- Day of February (3/4/5) each solar year begins, indexed from 1950..2100
  -- (151 entries). Verbatim from START_DAY_FEB in lifeChartCharacter.ts.
  start_day_feb constant int[] := array[
    4,4,5,4,4,4,5,4,4,4,      -- 1950-1959
    5,4,4,4,5,4,4,4,5,4,      -- 1960-1969
    4,4,5,4,4,4,5,4,4,4,      -- 1970-1979
    5,4,4,4,5,4,4,4,5,4,      -- 1980-1989
    4,4,4,4,4,4,4,4,4,4,      -- 1990-1999
    4,4,4,4,4,4,4,4,4,4,      -- 2000-2009
    4,4,4,4,4,4,4,3,4,4,      -- 2010-2019
    4,3,4,4,4,3,4,4,4,3,      -- 2020-2029
    4,4,4,3,4,4,4,3,4,4,      -- 2030-2039
    4,3,4,4,4,3,4,4,4,3,      -- 2040-2049
    3,4,4,3,4,4,4,3,4,4,      -- 2050-2059
    4,3,4,4,4,3,3,4,4,3,      -- 2060-2069
    4,4,4,3,4,4,4,3,4,4,      -- 2070-2079
    4,3,4,4,4,3,4,4,4,3,      -- 2080-2089
    4,4,4,3,4,4,4,3,4,4,      -- 2090-2099
    4                         -- 2100
  ];
  -- [male, female] by ((chineseYear - 1950) mod 9). Verbatim from CYCLE.
  male_cycle   constant text[] := array['E','W-','W+','E-','W','F','E+','G-','G+'];
  female_cycle constant text[] := array['W','E-','W+','W-','E','G+','G-','E+','F'];
  y        int;
  m        int;
  d        int;
  cy       int;
  idx      int;
  boundary int;
  slot     int;
begin
  if p_dob is null then return null; end if;
  if p_gender is null or p_gender not in ('male','female') then return null; end if;

  y := extract(year  from p_dob)::int;
  m := extract(month from p_dob)::int;
  d := extract(day   from p_dob)::int;

  -- chineseYearForDate: Jan -> prev solar year; Mar-Dec -> this year;
  -- Feb -> depends on the boundary day.
  if m < 2 then
    cy := y - 1;
  elsif m > 2 then
    cy := y;
  else
    idx := y - 1950;                       -- 0-based year offset
    if idx >= 0 and idx < array_length(start_day_feb, 1) then
      boundary := start_day_feb[idx + 1];  -- 1-based array access
    else
      boundary := 4;
    end if;
    if d < boundary then cy := y - 1; else cy := y; end if;
  end if;

  if cy < 1950 or cy > 2100 then return null; end if;

  slot := ((cy - 1950) % 9 + 9) % 9;       -- 0..8
  if p_gender = 'male' then
    return male_cycle[slot + 1];
  else
    return female_cycle[slot + 1];
  end if;
end;
$$;

revoke all on function public.compute_life_chart_character(date, text) from public;
grant execute on function public.compute_life_chart_character(date, text) to service_role;

-- ---- Fill-only trigger: derive when the client left it NULL ----------------
create or replace function public.trg_fill_life_chart_character()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault, pg_catalog
as $$
declare
  passphrase text;
  v_dob_text text;
begin
  -- FILL-ONLY: never overwrite a client-supplied value (backward-compatible).
  if new.life_chart_character is not null then
    return new;
  end if;
  -- Need both an encrypted DOB and a gender to derive anything.
  if new.date_of_birth_encrypted is null or new.gender is null then
    return new;
  end if;

  begin
    select decrypted_secret into passphrase
      from vault.decrypted_secrets
     where name = 'bole_dob_passphrase'
     limit 1;
    if passphrase is null then
      return new;  -- secret unavailable; leave as-is
    end if;

    v_dob_text := pgp_sym_decrypt(new.date_of_birth_encrypted, passphrase);
    new.life_chart_character :=
      public.compute_life_chart_character(v_dob_text::date, new.gender);
  exception when others then
    -- A bad ciphertext / bad date must NEVER abort the row write.
    raise warning 'trg_fill_life_chart_character: derivation skipped: %', sqlerrm;
    return new;
  end;

  return new;
end;
$$;

revoke all on function public.trg_fill_life_chart_character() from public;

drop trigger if exists trg_talents_fill_life_chart on public.talents;
create trigger trg_talents_fill_life_chart
  before insert or update on public.talents
  for each row execute function public.trg_fill_life_chart_character();

drop trigger if exists trg_hm_fill_life_chart on public.hiring_managers;
create trigger trg_hm_fill_life_chart
  before insert or update on public.hiring_managers
  for each row execute function public.trg_fill_life_chart_character();

comment on function public.compute_life_chart_character(date, text) is
  'Pure SQL port of lifeChartCharacter.ts. Deterministic 9-year Li Chun cycle, 1950-2100. Added by 0198 (B1).';
comment on function public.trg_fill_life_chart_character() is
  'Fill-only trigger: derives life_chart_character server-side ONLY when NULL (decrypts DOB internally). Backward-compatible with the client that still supplies the value. Added by 0198 (B1).';
