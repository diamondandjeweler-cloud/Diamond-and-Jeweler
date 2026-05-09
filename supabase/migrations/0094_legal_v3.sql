-- Migration 0094: Bump legal notice to version 3.1 (1 May 2026)
-- Reflects the rewritten Privacy Notice aligned with PDPA 2010.

insert into system_config (key, value) values
  ('legal_last_updated',   '1 May 2026'),
  ('legal_version',        '3.1')
on conflict (key) do update set value = excluded.value;
