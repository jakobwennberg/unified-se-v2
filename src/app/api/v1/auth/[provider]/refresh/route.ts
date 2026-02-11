import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateProvider, getOAuthConfig } from '@/lib/api/oauth-config';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import type { TokenResponse } from '@/lib/providers/types';
import { refreshFortnoxToken } from '@/lib/providers/fortnox/oauth';
import { refreshVismaToken } from '@/lib/providers/visma/oauth';
import { refreshBrioxToken } from '@/lib/providers/briox/oauth';
import { refreshBjornLundenToken } from '@/lib/providers/bjornlunden/oauth';

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

  if (provider === 'bokio') {
    return NextResponse.json({ error: 'Bokio uses private API tokens that do not expire. No refresh needed.' }, { status: 400 });
  }

  if (provider === 'bjornlunden') {
    const tokens = await refreshBjornLundenToken();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from('consent_tokens').update({
      access_token: tokens.access_token,
      token_expires_at: expiresAt,
    }).eq('consent_id', consentId);

    return NextResponse.json({ success: true, expires_in: tokens.expires_in });
  }

  const { data: tokenRows } = await supabase
    .from('consent_tokens')
    .select('refresh_token')
    .eq('consent_id', consentId)
    .limit(1);

  if (!tokenRows || tokenRows.length === 0 || !tokenRows[0]!.refresh_token) {
    return NextResponse.json({ error: 'No refresh token found' }, { status: 400 });
  }

  const config = getOAuthConfig(provider);
  let tokens: TokenResponse;

  if (provider === 'fortnox') {
    tokens = await refreshFortnoxToken(config, tokenRows[0]!.refresh_token);
  } else if (provider === 'briox') {
    tokens = await refreshBrioxToken(config.clientId, tokenRows[0]!.refresh_token);
  } else {
    tokens = await refreshVismaToken(config, tokenRows[0]!.refresh_token);
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase.from('consent_tokens').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: expiresAt,
  }).eq('consent_id', consentId);

  return NextResponse.json({ success: true, expires_in: tokens.expires_in });
}
