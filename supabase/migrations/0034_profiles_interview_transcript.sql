-- Stores the Bo chat transcript immediately after the chat phase completes,
-- before the talent/HM finishes uploading docs / DOB.
-- Protects against data loss if the user abandons mid-onboarding.
-- Cleared by the client after the final talents/hiring_managers insert succeeds.

alter table public.profiles
  add column if not exists interview_transcript jsonb;
