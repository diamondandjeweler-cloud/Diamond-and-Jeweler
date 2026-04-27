-- ============================================================
-- BoLe Platform — Helper Functions (Milestone 1)
-- is_admin() helper + DOB encryption via pgsodium.
-- Runs AFTER 0001_schema.sql (depends on public.profiles).
-- ============================================================

-- ---------- is_admin() ----------
-- SECURITY DEFINER so the function itself (not the caller) reads profiles,
-- bypassing RLS on profiles. GRANT EXECUTE to authenticated is required
-- for RLS policies to call this helper.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_banned = false
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- ---------- pgsodium key for DOB encryption ----------
-- pgsodium stores the actual key material; we only reference it by UUID.
-- The named key 'bole_dob_key' is created once (idempotent).

create extension if not exists pgsodium cascade;

do $$
declare
  existing_key_id uuid;
begin
  select id into existing_key_id
    from pgsodium.valid_key
    where name = 'bole_dob_key'
    limit 1;

  if existing_key_id is null then
    perform pgsodium.create_key(
      key_type := 'aead-ietf',
      name := 'bole_dob_key'
    );
  end if;
end
$$;

-- ---------- encrypt_dob(text) ----------
-- Returns nonce (12B) || ciphertext, as a single bytea.
-- Any authenticated user can encrypt (they're encrypting their own DOB).
-- Callers should write the returned bytea into date_of_birth_encrypted.

create or replace function public.encrypt_dob(dob_text text)
returns bytea
language plpgsql
security definer
set search_path = public, pgsodium, extensions
as $$
declare
  key_id_uuid uuid;
  nonce bytea;
  ciphertext bytea;
begin
  if dob_text is null or dob_text = '' then
    return null;
  end if;

  -- Validate format; raises if not a valid date
  perform dob_text::date;

  select id into key_id_uuid
    from pgsodium.valid_key
    where name = 'bole_dob_key'
    limit 1;
  if key_id_uuid is null then
    raise exception 'encrypt_dob: pgsodium key not found';
  end if;

  nonce := pgsodium.crypto_aead_ietf_noncegen();
  ciphertext := pgsodium.crypto_aead_ietf_encrypt(
    message    := convert_to(dob_text, 'utf8'),
    additional := convert_to('bole_dob', 'utf8'),
    nonce      := nonce,
    key_uuid   := key_id_uuid
  );

  return nonce || ciphertext;
end;
$$;

-- ---------- decrypt_dob(bytea) ----------
-- Only admin or service_role can decrypt.
-- Authenticated users who try to call this get an exception.

create or replace function public.decrypt_dob(encrypted bytea)
returns text
language plpgsql
security definer
set search_path = public, pgsodium, extensions
as $$
declare
  key_id_uuid uuid;
  nonce bytea;
  ciphertext bytea;
  plaintext bytea;
  caller_role text;
begin
  if encrypted is null then
    return null;
  end if;

  caller_role := current_setting('role', true);
  if not public.is_admin() and caller_role is distinct from 'service_role' then
    raise exception 'decrypt_dob: not authorized';
  end if;

  select id into key_id_uuid
    from pgsodium.valid_key
    where name = 'bole_dob_key'
    limit 1;
  if key_id_uuid is null then
    raise exception 'decrypt_dob: pgsodium key not found';
  end if;

  nonce := substring(encrypted from 1 for 12);
  ciphertext := substring(encrypted from 13);

  plaintext := pgsodium.crypto_aead_ietf_decrypt(
    message    := ciphertext,
    additional := convert_to('bole_dob', 'utf8'),
    nonce      := nonce,
    key_uuid   := key_id_uuid
  );

  return convert_from(plaintext, 'utf8');
end;
$$;

revoke execute on function public.encrypt_dob(text) from public;
revoke execute on function public.decrypt_dob(bytea) from public;
grant execute on function public.encrypt_dob(text) to authenticated, service_role;
-- decrypt_dob is callable by authenticated users, but the body gates access.
-- This prevents leaking "function doesn't exist" errors to unauthorized users.
grant execute on function public.decrypt_dob(bytea) to authenticated, service_role;
