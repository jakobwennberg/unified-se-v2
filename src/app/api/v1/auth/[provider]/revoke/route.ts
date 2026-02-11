import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateProvider, getOAuthConfig } from '@/lib/api/oauth-config';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { revokeFortnoxToken } from '@/lib/providers/fortnox/oauth';
import { revokeVismaToken } from '@/lib/providers/visma/oauth';
import { randomUUID } from 'node:crypto';

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!validateProvider(provider)) {
    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  }

  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { consentId } = body;
  if (!consentId) {
    return NextResponse.json({ error: 'consentId is required' }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: consentRows } = await supabase
    .from('consents')
    .select('id')
    .eq('id', consentId)
    .eq('tenant_id', auth.tenantId)
    .limit(1);

  if (!consentRows || consentRows.length === 0) {
    return NextResponse.json({ error: 'Consent not found' }, { status: 404 });
  }

  const { data: tokenRows } = await supabase
    .from('consent_tokens')
    .select('refresh_token')
    .eq('consent_id', consentId)
    .limit(1);

  if (tokenRows && tokenRows.length > 0 && tokenRows[0]!.refresh_token) {
    const config = getOAuthConfig(provider);
    if (provider === 'fortnox') {
      await revokeFortnoxToken(config, tokenRows[0]!.refresh_token);
    } else if (provider === 'visma') {
      await revokeVismaToken(config, tokenRows[0]!.refresh_token);
    }
  }

  await supabase.from('consent_tokens').delete().eq('consent_id', consentId);

  const now = new Date().toISOString();
  const newEtag = randomUUID();
  await supabase.from('consents').update({ status: 2, etag: newEtag, updated_at: now }).eq('id', consentId);

  return NextResponse.json({ success: true });
}
