import { createClient } from '@supabase/supabase-js';

const UPGRADE_CTA = 'Contact jakob.wennberg@arcim.io to upgrade your plan.';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface LimitResult {
  allowed: boolean;
  error?: string;
  status?: number;
}

export async function checkConsentLimit(
  tenantId: string,
  maxConsents: number,
): Promise<LimitResult> {
  const supabase = getServiceClient();

  const { count, error } = await supabase
    .from('consents')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (error) {
    return { allowed: false, error: 'Failed to check consent limit.', status: 500 };
  }

  if ((count ?? 0) >= maxConsents) {
    return {
      allowed: false,
      error: `You have reached your limit of ${maxConsents} consents. ${UPGRADE_CTA}`,
      status: 403,
    };
  }

  return { allowed: true };
}

export async function checkAndIncrementAIUsage(
  tenantId: string,
): Promise<LimitResult> {
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc('increment_ai_usage', {
    p_tenant_id: tenantId,
  });

  if (error) {
    // Fail closed — block on RPC errors for cost safety
    return { allowed: false, error: 'Failed to check AI usage limit.', status: 500 };
  }

  // If no rows returned, the UPDATE WHERE clause didn't match (limit reached)
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return {
      allowed: false,
      error: `You have reached your AI request limit. ${UPGRADE_CTA}`,
      status: 403,
    };
  }

  return { allowed: true };
}
