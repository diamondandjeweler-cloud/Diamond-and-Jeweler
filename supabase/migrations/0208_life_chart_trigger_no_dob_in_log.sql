-- 0208_life_chart_trigger_no_dob_in_log.sql
-- ============================================================================
-- SECURITY (reaudit staged-migrations-1, LOW) — stop the life_chart trigger
-- from leaking a decrypted plaintext DOB into the Postgres/Supabase server log.
--
-- 0198 installed trg_fill_life_chart_character(): after decrypting the DOB it
-- casts v_dob_text::date, and its `when others` handler logged SQLERRM. On a bad
-- date cast SQLERRM embeds the offending input string — i.e. the DECRYPTED
-- plaintext DOB — defeating the DOB-encryption regime (0013; decrypt_dob stays
-- REVOKED, governor §6). This migration re-applies the trigger function via
-- CREATE OR REPLACE so it logs ONLY the non-sensitive SQLSTATE code.
--
-- WHY A FRESH MIGRATION (not an in-place edit of 0198): 0198 is part of the
-- staged Wave-B manifest (docs/STAGED_DEPLOYS.md). A migration runner tracks
-- files by checksum and will NOT re-run 0198 if it was already applied, so an
-- in-place edit could be SILENTLY SKIPPED and the leak fix would never reach the
-- DB. Landing the fix as the next-free migration guarantees it applies whether or
-- not 0198 has already been applied — mirroring how 0200 was split out of 0194.
--
-- Idempotent (CREATE OR REPLACE / REVOKE / COMMENT are re-appliable). The
-- function signature, SECURITY DEFINER context, search_path, the two triggers it
-- backs (trg_talents_fill_life_chart / trg_hm_fill_life_chart), and all row-write
-- behavior are UNCHANGED — the ONLY difference vs. 0198 is the log line.
-- Author-only — owner must apply.
-- ============================================================================

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
    -- Log ONLY the non-sensitive SQLSTATE code, never SQLERRM: on a failed
    -- v_dob_text::date cast SQLERRM embeds the offending input string, i.e. the
    -- decrypted plaintext DOB, which would leak to the Postgres/Supabase server
    -- log and defeat the DOB-encryption regime (0013, decrypt_dob stays revoked).
    raise warning 'trg_fill_life_chart_character: derivation skipped (sqlstate %)', sqlstate;
    return new;
  end;

  return new;
end;
$$;

revoke all on function public.trg_fill_life_chart_character() from public;

comment on function public.trg_fill_life_chart_character() is
  'Fill-only trigger: derives life_chart_character server-side ONLY when NULL (decrypts DOB internally). Logs SQLSTATE only, never SQLERRM, so a bad-date cast cannot leak the plaintext DOB (0208). Backward-compatible with the client that still supplies the value. Added by 0198 (B1), hardened by 0208.';
