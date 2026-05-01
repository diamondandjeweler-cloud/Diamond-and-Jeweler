-- 0066_monthly_character_boost.sql
--
-- Admin selects 2–3 life-chart characters on the 1st of each month.
-- Talents whose character matches get a priority boost for that month.
--
-- Security: selected characters stored as AES-encrypted bytea.
-- Only service_role (match-generate) can decrypt via get_monthly_boost_characters().
-- Admin UI writes via submit-monthly-boost Edge Function — never reads back.

create table if not exists public.monthly_character_boost (
  month            date        primary key
    check (extract(day from month) = 1),   -- must be 1st of month
  characters_encrypted bytea   not null,
  submitted_by     uuid        references public.profiles(id) on delete set null,
  submitted_at     timestamptz not null default now()
);

alter table public.monthly_character_boost enable row level security;

-- Admins can insert/update/select their own submissions.
create policy mcb_admin on public.monthly_character_boost
  for all
  using  (public.is_admin())
  with check (public.is_admin());

-- service_role bypasses RLS by default; no extra policy needed.

-- ── Decrypt function — service_role only ─────────────────────────────────────
-- Returns the array of boosted characters for a given month,
-- or NULL if no submission exists.

create or replace function public.get_monthly_boost_characters(p_month date)
returns text[]
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  caller_role  text;
  passphrase   text;
  enc_val      bytea;
  decrypted    text;
begin
  caller_role := current_setting('role', true);
  if caller_role is distinct from 'service_role' then
    raise exception 'get_monthly_boost_characters: not authorized';
  end if;

  select characters_encrypted into enc_val
  from public.monthly_character_boost
  where month = date_trunc('month', p_month)::date
  limit 1;

  if enc_val is null then
    return null;
  end if;

  select decrypted_secret into passphrase
  from vault.decrypted_secrets
  where name = 'bole_dob_passphrase'
  limit 1;

  if passphrase is null then
    return null;
  end if;

  decrypted := pgp_sym_decrypt(enc_val, passphrase);
  return array(select jsonb_array_elements_text(decrypted::jsonb));
end;
$$;

revoke all on function public.get_monthly_boost_characters(date) from public;
revoke all on function public.get_monthly_boost_characters(date) from authenticated;
grant execute on function public.get_monthly_boost_characters(date) to service_role;

-- ── Encrypt-and-upsert function — admin only ─────────────────────────────────
-- Called by the submit-monthly-boost Edge Function (service_role context).
-- Accepts a jsonb array like '["W","G+","E-"]' and encrypts before storing.

create or replace function public.upsert_monthly_boost(
  p_month      date,
  p_characters jsonb,   -- e.g. '["W","G+","E-"]'
  p_admin_id   uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  caller_role text;
  passphrase  text;
  encrypted   bytea;
begin
  caller_role := current_setting('role', true);
  if caller_role is distinct from 'service_role' then
    raise exception 'upsert_monthly_boost: not authorized';
  end if;

  if extract(day from p_month) <> 1 then
    raise exception 'p_month must be the 1st of the month';
  end if;

  select decrypted_secret into passphrase
  from vault.decrypted_secrets
  where name = 'bole_dob_passphrase'
  limit 1;

  if passphrase is null then
    raise exception 'bole_dob_passphrase not found in vault';
  end if;

  encrypted := pgp_sym_encrypt(p_characters::text, passphrase);

  insert into public.monthly_character_boost (month, characters_encrypted, submitted_by, submitted_at)
  values (p_month, encrypted, p_admin_id, now())
  on conflict (month) do update
    set characters_encrypted = excluded.characters_encrypted,
        submitted_by         = excluded.submitted_by,
        submitted_at         = excluded.submitted_at;
end;
$$;

revoke all on function public.upsert_monthly_boost(date, jsonb, uuid) from public;
revoke all on function public.upsert_monthly_boost(date, jsonb, uuid) from authenticated;
grant execute on function public.upsert_monthly_boost(date, jsonb, uuid) to service_role;

-- ── system_config weight ─────────────────────────────────────────────────────
insert into public.system_config (key, value)
values ('weight_monthly_boost', to_jsonb(0.12::float8))
on conflict (key) do nothing;
