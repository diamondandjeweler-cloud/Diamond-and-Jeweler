-- 0099 — Bump legal notice to v3.2 (9 May 2026)
--
-- Adds §11 Refunds & Chargebacks to user-facing Terms (apps/web/src/routes/legal/Terms.tsx).
-- Bumps legal_version + legal_last_updated in system_config so the Terms page
-- reflects the new version and a re-consent prompt fires for users who
-- accepted v3.1.
--
-- system_config.value is jsonb (see 0001_schema.sql), so values must be
-- valid JSON literals. JSON-quote the strings.

insert into system_config (key, value) values
  ('legal_version',      '"3.2"'::jsonb),
  ('legal_last_updated', '"9 May 2026"'::jsonb)
on conflict (key) do update set value = excluded.value;
