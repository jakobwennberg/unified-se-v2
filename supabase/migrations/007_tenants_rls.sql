-- Enable RLS on tenants table (defense-in-depth)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Dashboard users (Supabase Auth) can read/update their own tenant row
CREATE POLICY tenants_auth_user_select ON tenants
  FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY tenants_auth_user_update ON tenants
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());
