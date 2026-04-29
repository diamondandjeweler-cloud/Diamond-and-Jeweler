-- fix c: culture data source metadata on hiring_managers
--   'ai_inferred'    — culture signals extracted from Bo onboarding conversation (default)
--   'survey_verified' — signals confirmed via structured survey (future)
alter table hiring_managers
  add column if not exists culture_data_source text not null default 'ai_inferred';

-- fix d: driving licence requirement on roles
alter table roles
  add column if not exists requires_driving_license boolean not null default false;

-- fix e: role-type weight preset on roles
--   NULL / 'default'  — standard balanced weights
--   'operations'      — reliability, culture, feedback
--   'technical'       — skills, background, behavioural
--   'creative'        — culture, background, style
--   'sales'           — character, age, feedback
--   'management'      — leadership behaviourals, culture, character
alter table roles
  add column if not exists weight_preset text;
