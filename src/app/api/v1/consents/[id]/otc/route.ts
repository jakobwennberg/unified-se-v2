import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { randomUUID } from 'node:crypto';

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: consentId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getServiceClient();
  const { data: consent } = await supabase
    .from('consents')
    .select('id')
    .eq('id', consentId)
    .eq('tenant_id', auth.tenantId)
    .limit(1);

  if (!consent || consent.length === 0) {
    return NextResponse.json({ error: 'Consent not found' }, { status: 404 });
  }

  const code = randomUUID().replace(/-/g, '').substring(0, 32);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('one_time_codes').insert({
    code,
    consent_id: consentId,
    expires_at: expiresAt,
  });

  return NextResponse.json({ code, expiresAt });
}
