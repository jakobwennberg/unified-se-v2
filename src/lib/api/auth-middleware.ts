import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export interface AuthResult {
  tenantId: string;
  tenant: Record<string, unknown>;
}

export async function authenticateRequest(request: Request): Promise<AuthResult | null> {
  // Mode 1: API key in Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const apiKey = authHeader.replace(/^Bearer\s+/i, '');
    if (apiKey) {
      const keyHash = hashApiKey(apiKey);
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      // Check api_keys table first
      const { data: keyRows } = await supabase
        .from('api_keys')
        .select('tenant_id, tenants!inner(id, name, email, plan, rate_limit_per_minute, rate_limit_per_day, max_consents)')
        .eq('key_hash', keyHash)
        .is('revoked_at', null)
        .limit(1);

      if (keyRows && keyRows.length > 0) {
        const row = keyRows[0]!;
        const tenant = row.tenants as unknown as Record<string, unknown>;
        return { tenantId: row.tenant_id, tenant };
      }

      // Fallback: check legacy api_key_hash on tenants table
      const { data: tenantRows } = await supabase
        .from('tenants')
        .select('id, name, email, plan, rate_limit_per_minute, rate_limit_per_day, max_consents')
        .eq('api_key_hash', keyHash)
        .limit(1);

      if (tenantRows && tenantRows.length > 0) {
        const tenant = tenantRows[0]!;
        return { tenantId: tenant.id as string, tenant };
      }

      return null;
    }
  }

  // Mode 2: Supabase session cookie
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: tenantRows } = await serviceClient
      .from('tenants')
      .select('id, name, email, plan, rate_limit_per_minute, rate_limit_per_day, max_consents')
      .eq('auth_user_id', user.id)
      .limit(1);

    if (tenantRows && tenantRows.length > 0) {
      const tenant = tenantRows[0]!;
      return { tenantId: tenant.id as string, tenant };
    }
  } catch {
    // Cookie-based auth failed — not an error, just unauthenticated
  }

  return null;
}
