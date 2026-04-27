-- 0045_talent_documents.sql
-- Separates sensitive document storage from the core talent profile.

CREATE TABLE IF NOT EXISTS talent_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id       UUID NOT NULL REFERENCES talents(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL CHECK (doc_type IN ('ic', 'resume', 'cover_letter')),
  storage_path    TEXT NOT NULL,
  file_name       TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purge_after     TIMESTAMPTZ   -- IC: 30 days after verification; resume: null (retained)
);

-- Talent can only see their own documents.
ALTER TABLE talent_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY talent_documents_select_own ON talent_documents
  FOR SELECT USING (
    talent_id IN (SELECT id FROM talents WHERE profile_id = auth.uid())
  );

CREATE POLICY talent_documents_insert_own ON talent_documents
  FOR INSERT WITH CHECK (
    talent_id IN (SELECT id FROM talents WHERE profile_id = auth.uid())
  );

-- Admins can see everything.
CREATE POLICY talent_documents_admin ON talent_documents
  FOR ALL USING (is_admin());

-- IC purge: flag IC docs for 30-day purge, same as the existing purge policy.
CREATE INDEX IF NOT EXISTS talent_documents_talent_id_idx ON talent_documents (talent_id);
CREATE INDEX IF NOT EXISTS talent_documents_purge_after_idx ON talent_documents (purge_after) WHERE purge_after IS NOT NULL;
