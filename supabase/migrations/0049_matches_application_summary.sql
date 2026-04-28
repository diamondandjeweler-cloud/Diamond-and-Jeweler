-- Add AI-generated job-specific application summary to matches.
-- Populated by match-generate when a match is created; null for older matches.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS application_summary TEXT;
