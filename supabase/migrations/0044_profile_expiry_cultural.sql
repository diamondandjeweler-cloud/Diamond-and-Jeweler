-- 0044_profile_expiry_cultural.sql
-- Adds cultural demographic fields and 45-day expiry for talent profiles and job vacancies.

-- ── talents ──────────────────────────────────────────────────────────────────
ALTER TABLE talents ADD COLUMN IF NOT EXISTS race TEXT;
ALTER TABLE talents ADD COLUMN IF NOT EXISTS religion TEXT;
ALTER TABLE talents ADD COLUMN IF NOT EXISTS languages JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE talents ADD COLUMN IF NOT EXISTS uses_lunar_calendar BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE talents ADD COLUMN IF NOT EXISTS profile_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '45 days');

-- Back-fill any NULL values on older rows (safeguard).
UPDATE talents SET profile_expires_at = NOW() + INTERVAL '45 days' WHERE profile_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS talents_profile_expires_at_idx ON talents (profile_expires_at);

-- ── roles ─────────────────────────────────────────────────────────────────────
ALTER TABLE roles ADD COLUMN IF NOT EXISTS vacancy_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '45 days');

-- Back-fill active/paused roles so they don't expire immediately.
UPDATE roles SET vacancy_expires_at = NOW() + INTERVAL '45 days'
  WHERE vacancy_expires_at IS NULL AND status IN ('active', 'paused');

CREATE INDEX IF NOT EXISTS roles_vacancy_expires_at_idx ON roles (vacancy_expires_at);
