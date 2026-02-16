import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { checkConsentLimit } from '@/lib/api/plan-limits';
import { randomUUID } from 'node:crypto';

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getServiceClient();
  const { data: rows } = await supabase
    .from('consents')
    .select('id, tenant_id, name, status, provider, org_number, company_name, system_settings_id, etag, created_at, updated_at, expires_at')
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false });

  return NextResponse.json({ data: rows ?? [] });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const consentCheck = await checkConsentLimit(auth.tenantId, auth.tenant.max_consents as number);
  if (!consentCheck.allowed) {
    return NextResponse.json({ error: consentCheck.error }, { status: consentCheck.status });
  }

  const body = await request.json();
  const { name, provider, orgNumber, companyName, systemSettingsId } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  if (provider && !['fortnox', 'visma', 'briox', 'bokio', 'bjornlunden', 'manual-sie'].includes(provider)) {
    return NextResponse.json({ error: 'provider must be fortnox, visma, briox, bokio, bjornlunden, or manual-sie' }, { status: 400 });
  }

  const supabase = getServiceClient();
  const id = randomUUID();
  const etag = randomUUID();
  const now = new Date().toISOString();

  await supabase.from('consents').insert({
    id,
    tenant_id: auth.tenantId,
    name,
    status: 0,
    provider: provider ?? null,
    org_number: orgNumber ?? null,
    company_name: companyName ?? null,
    system_settings_id: systemSettingsId ?? null,
    etag,
    created_at: now,
    updated_at: now,
  });

  const { data: rows } = await supabase.from('consents').select('*').eq('id', id);
  return NextResponse.json(rows?.[0] ?? {}, { status: 201 });
}
