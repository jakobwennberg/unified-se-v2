-- Add AI usage tracking
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_requests_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_ai_requests INTEGER NOT NULL DEFAULT 10;

-- Lower default max_consents for new tenants (existing rows unaffected)
ALTER TABLE tenants ALTER COLUMN max_consents SET DEFAULT 5;

-- Atomic check-and-increment function (prevents race conditions)
CREATE OR REPLACE FUNCTION increment_ai_usage(p_tenant_id TEXT)
RETURNS TABLE(new_count INTEGER, max_allowed INTEGER) AS $$
  UPDATE tenants
  SET ai_requests_used = ai_requests_used + 1, updated_at = now()
  WHERE id = p_tenant_id AND ai_requests_used < max_ai_requests
  RETURNING ai_requests_used, max_ai_requests;
$$ LANGUAGE sql SET search_path = public;
