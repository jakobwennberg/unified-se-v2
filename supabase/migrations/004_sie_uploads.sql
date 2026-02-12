-- SIE file uploads for manual-sie provider
CREATE TABLE IF NOT EXISTS sie_uploads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  consent_id TEXT NOT NULL REFERENCES consents(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  sie_type TEXT,
  parsed_data JSONB NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sie_uploads_consent ON sie_uploads (consent_id);

-- RLS: accessible through consent ownership (same pattern as consent_tokens)
ALTER TABLE sie_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY sie_uploads_isolation ON sie_uploads
  FOR ALL
  USING (
    consent_id IN (
      SELECT id FROM consents
      WHERE tenant_id = current_setting('app.tenant_id', true)
    )
  );
