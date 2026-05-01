-- 0065_peak_age_window.sql
--
-- Stores the proprietary peak-age-window ranges in Supabase Vault as an
-- AES-encrypted JSON blob.  The raw data never appears in any queryable table.
--
-- Access: SECURITY DEFINER function `public.get_peak_age_score()` only.
-- Callers: service_role (match-generate Edge Function).

-- ── 1. Store encrypted blob in Vault ─────────────────────────────────────────
-- The JSON is encrypted with the same vault passphrase used for DOBs
-- (bole_dob_passphrase), adding a second encryption layer on top of Vault's
-- built-in pgsodium encryption.  Even with direct DB access the data is opaque.

do $$
declare
  passphrase text;
  payload    text := '{
    "character":{
      "W":[{"min":50,"max":55}],
      "E-":[{"min":23,"max":28}],
      "W+":[{"min":29,"max":34}],
      "W-":null,
      "E":[{"min":35,"max":40}],
      "G+":[{"min":55,"max":60}],
      "G-":[{"min":40,"max":45}],
      "E+":[{"min":45,"max":50}],
      "F":[{"min":20,"max":25}]
    },
    "born_day":{
      "1":[{"min":50,"max":55}],
      "2":[{"min":23,"max":28}],
      "3":[{"min":29,"max":34}],
      "4":null,
      "5":[{"min":35,"max":40}],
      "6":[{"min":55,"max":60}],
      "7":[{"min":40,"max":45}],
      "8":[{"min":45,"max":50}],
      "9":[{"min":20,"max":25}],
      "10":[{"min":50,"max":55}],
      "11":[{"min":50,"max":55}],
      "12":[{"min":23,"max":28},{"min":50,"max":55}],
      "13":[{"min":29,"max":34},{"min":50,"max":55}],
      "14":[{"min":50,"max":55}],
      "15":[{"min":35,"max":40},{"min":50,"max":55}],
      "16":[{"min":50,"max":60}],
      "17":[{"min":40,"max":45},{"min":50,"max":55}],
      "18":[{"min":45,"max":55}],
      "19":[{"min":20,"max":25},{"min":50,"max":55}],
      "20":[{"min":23,"max":28}],
      "21":[{"min":23,"max":28},{"min":50,"max":55}],
      "22":[{"min":23,"max":28}],
      "23":[{"min":29,"max":34},{"min":23,"max":28}],
      "24":[{"min":23,"max":28}],
      "25":[{"min":35,"max":40},{"min":23,"max":28}],
      "26":[{"min":23,"max":28},{"min":55,"max":60}],
      "27":[{"min":23,"max":28},{"min":40,"max":45}],
      "28":[{"min":23,"max":28},{"min":45,"max":50}],
      "29":[{"min":20,"max":28}],
      "30":[{"min":29,"max":34}],
      "31":[{"min":29,"max":34},{"min":50,"max":55}]
    }
  }';
  encrypted  bytea;
begin
  select decrypted_secret into passphrase
  from vault.decrypted_secrets
  where name = 'bole_dob_passphrase'
  limit 1;

  if passphrase is null then
    raise exception 'bole_dob_passphrase not found in vault — run 0013 migration first';
  end if;

  encrypted := pgp_sym_encrypt(payload, passphrase);

  -- Upsert: safe to re-run migration.
  if exists (select 1 from vault.secrets where name = 'bole_peak_age_ranges') then
    update vault.secrets
    set secret = encode(encrypted, 'base64')
    where name = 'bole_peak_age_ranges';
  else
    perform vault.create_secret(encode(encrypted, 'base64'), 'bole_peak_age_ranges');
  end if;
end;
$$;

-- ── 2. Lookup function — service_role only ───────────────────────────────────
--
-- Returns:
--   100  — talent's current age falls within a peak window (either character or born-day)
--     0  — talent is outside all defined windows
--  NULL  — no peak defined for this character+born_day combination
--
-- p_dob       : talent DOB as 'YYYY-MM-DD' (already decrypted by caller)
-- p_character : life_chart_character value  (e.g. 'W', 'E-', 'G+')
-- p_born_day  : day-of-month from DOB (1–31)

create or replace function public.get_peak_age_score(
  p_dob       text,
  p_character text,
  p_born_day  int
)
returns int
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  caller_role  text;
  passphrase   text;
  encrypted_b64 text;
  decrypted_payload text;
  ranges_json  jsonb;
  char_ranges  jsonb;
  day_ranges   jsonb;
  current_age  int;
  r            jsonb;
  any_defined  boolean := false;
begin
  -- Gate: service_role only.
  caller_role := current_setting('role', true);
  if caller_role is distinct from 'service_role' then
    raise exception 'get_peak_age_score: not authorized';
  end if;

  -- Compute talent's current age in years.
  begin
    current_age := date_part('year', age(p_dob::date));
  exception when others then
    return null;
  end;

  -- Decrypt the vault blob.
  select decrypted_secret into passphrase
  from vault.decrypted_secrets
  where name = 'bole_dob_passphrase'
  limit 1;

  select secret into encrypted_b64
  from vault.secrets
  where name = 'bole_peak_age_ranges'
  limit 1;

  if passphrase is null or encrypted_b64 is null then
    return null;
  end if;

  decrypted_payload := pgp_sym_decrypt(decode(encrypted_b64, 'base64'), passphrase);
  ranges_json := decrypted_payload::jsonb;

  -- Character ranges.
  char_ranges := ranges_json -> 'character' -> p_character;
  -- Born-day ranges.
  day_ranges  := ranges_json -> 'born_day'  -> p_born_day::text;

  -- Check all ranges from both lookups.
  for r in
    select * from jsonb_array_elements(
      coalesce(char_ranges, '[]'::jsonb) || coalesce(day_ranges, '[]'::jsonb)
    )
  loop
    any_defined := true;
    if current_age >= (r->>'min')::int and current_age <= (r->>'max')::int then
      return 100;
    end if;
  end loop;

  -- NULL when neither lookup has any ranges (W-, born_day 4, etc.)
  if not any_defined then
    if char_ranges is null and day_ranges is null then
      return null;
    end if;
  end if;

  return 0;
end;
$$;

-- Only service_role may execute; revoke from public and authenticated.
revoke all on function public.get_peak_age_score(text, int, int) from public;
revoke all on function public.get_peak_age_score(text, int, int) from authenticated;
grant execute on function public.get_peak_age_score(text, int, int) to service_role;

-- ── 3. Seed system_config weight ─────────────────────────────────────────────
insert into public.system_config (key, value)
values ('weight_peak_age', to_jsonb(0.10::float8))
on conflict (key) do nothing;
