-- ============================================================
-- BoLe Platform — DOB encryption refactor: pgsodium → pgcrypto + Vault
--
-- Why: Supabase cloud locks down pgsodium functions from the `postgres`
-- role; SECURITY DEFINER encrypt_dob/decrypt_dob fail with
-- "permission denied for function crypto_aead_ietf_noncegen". The
-- pragmatic fix (and the path Supabase itself now recommends for new
-- projects) is to use pgcrypto's pgp_sym_encrypt with the passphrase
-- stored in supabase_vault.
--
-- Threat model is equivalent to the pgsodium setup:
--   • Passphrase lives only in vault.decrypted_secrets (only the
--     database owner can read it; not exposed via PostgREST).
--   • encrypt_dob is callable by any authenticated user (they're
--     encrypting their own row).
--   • decrypt_dob is gated inside the body to admin + service_role,
--     same as before.
-- ============================================================

-- Ensure pgcrypto is available (it is by default on Supabase; this is idempotent).
create extension if not exists pgcrypto;

-- Seed the Vault secret once. Uses a strong random value the first time and
-- is a no-op afterwards (vault.secrets.name is unique).
do $$
declare
  existing uuid;
begin
  select id into existing from vault.secrets where name = 'bole_dob_passphrase';
  if existing is null then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'bole_dob_passphrase'
    );
  end if;
end
$$;

-- Replace encrypt_dob with a pgcrypto-backed version. Same signature so
-- callers (Edge Functions + frontend) don't change.
create or replace function public.encrypt_dob(dob_text text)
returns bytea
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  passphrase text;
begin
  if dob_text is null or dob_text = '' then
    return null;
  end if;

  -- Validates format; raises on bad date.
  perform dob_text::date;

  select decrypted_secret into passphrase
  from vault.decrypted_secrets
  where name = 'bole_dob_passphrase'
  limit 1;
  if passphrase is null then
    raise exception 'encrypt_dob: vault secret bole_dob_passphrase not found';
  end if;

  return pgp_sym_encrypt(dob_text, passphrase);
end;
$$;

-- Replace decrypt_dob. Same author-gating rule as the pgsodium version.
create or replace function public.decrypt_dob(encrypted bytea)
returns text
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  passphrase text;
  caller_role text;
begin
  if encrypted is null then
    return null;
  end if;

  caller_role := current_setting('role', true);
  if not public.is_admin() and caller_role is distinct from 'service_role' then
    raise exception 'decrypt_dob: not authorized';
  end if;

  select decrypted_secret into passphrase
  from vault.decrypted_secrets
  where name = 'bole_dob_passphrase'
  limit 1;
  if passphrase is null then
    raise exception 'decrypt_dob: vault secret bole_dob_passphrase not found';
  end if;

  return pgp_sym_decrypt(encrypted, passphrase);
end;
$$;

revoke execute on function public.encrypt_dob(text) from public;
revoke execute on function public.decrypt_dob(bytea) from public;
grant  execute on function public.encrypt_dob(text) to authenticated, service_role;
grant  execute on function public.decrypt_dob(bytea) to authenticated, service_role;

comment on function public.encrypt_dob(text) is
  'pgcrypto/Vault DOB encryption. Replaced pgsodium-based version (migration 0013) because pgsodium is locked down on Supabase cloud.';
comment on function public.decrypt_dob(bytea) is
  'pgcrypto/Vault DOB decryption, gated to admin + service_role. See migration 0013.';
