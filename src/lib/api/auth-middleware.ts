import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export interface AuthResult {
  tenantId: string;
  tenant: Record<string, unknown>;
}

export async function authenticateRequest(request: Request): Promise<AuthResult | null> {
  // Supabase session cookie auth
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
      .select('id, name, email, plan, rate_limit_per_minute, rate_limit_per_day, max_consents, ai_requests_used, max_ai_requests')
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
