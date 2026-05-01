-- Migration 0061: Set legal_reviewed = true and populate system_config for public launch
-- Marks the privacy notice as reviewed and sets the registered entity name.

insert into system_config (key, value) values
  ('legal_entity_name',    'CRM Solution (003808986-A)'),
  ('legal_reviewed',       'true'),
  ('legal_last_updated',   '2026-05-01'),
  ('legal_version',        '2.0'),
  ('legal_contact_email',  'privacy@diamondandjeweler.com'),
  ('legal_dpo_email',      'dpo@diamondandjeweler.com')
on conflict (key) do update set value = excluded.value;
