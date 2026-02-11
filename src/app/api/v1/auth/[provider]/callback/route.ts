import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateProvider, getOAuthConfig } from '@/lib/api/oauth-config';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import type { TokenResponse } from '@/lib/providers/types';
import { exchangeFortnoxCode } from '@/lib/providers/fortnox/oauth';
import { exchangeVismaCode } from '@/lib/providers/visma/oauth';
import { exchangeBrioxCode } from '@/lib/providers/briox/oauth';
import { storeBokioToken } from '@/lib/providers/bokio/oauth';
import { storeBjornLundenToken } from '@/lib/providers/bjornlunden/oauth';
import { randomUUID } from 'node:crypto';

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!validateProvider(provider)) {
    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  }

  const body = await request.json();
  const { code, consentId } = body;
  if (!code || !consentId) {
    return NextResponse.json({ error: 'code and consentId are required' }, { status: 400 });
  }

  const supabase = getServiceClient();
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the consent belongs to this tenant
  const { data: consentRows } = await supabase
    .from('consents')
    .select('id, provider')
    .eq('id', consentId)
    .eq('tenant_id', auth.tenantId)
    .limit(1);

  if (!consentRows || consentRows.length === 0) {
    return NextResponse.json({ error: 'Consent not found' }, { status: 404 });
  }

  const consent = consentRows[0]!;
  if (consent.provider !== provider) {
    return NextResponse.json({ error: `Consent provider mismatch: expected ${consent.provider}, got ${provider}` }, { status: 400 });
  }

  let tokens: TokenResponse;

  if (provider === 'bokio') {
    const { companyId } = body;
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required for Bokio' }, { status: 400 });
    }

    tokens = storeBokioToken(code);

    await supabase.from('consent_tokens').upsert({
      consent_id: consentId,
      provider,
      access_token: tokens.access_token,
      refresh_token: '',
      token_expires_at: null,
      provider_company_id: companyId,
    }, { onConflict: 'consent_id' });
  } else if (provider === 'bjornlunden') {
    const { companyId } = body;
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required for Björn Lunden' }, { status: 400 });
    }

    tokens = await storeBjornLundenToken();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from('consent_tokens').upsert({
      consent_id: consentId,
      provider,
      access_token: tokens.access_token,
      refresh_token: '',
      token_expires_at: expiresAt,
      provider_company_id: companyId,
    }, { onConflict: 'consent_id' });
  } else {
    const config = getOAuthConfig(provider);

    if (provider === 'fortnox') {
      tokens = await exchangeFortnoxCode(config, code);
    } else if (provider === 'briox') {
      tokens = await exchangeBrioxCode(config.clientId, code);
    } else {
      tokens = await exchangeVismaCode(config, code);
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from('consent_tokens').upsert({
      consent_id: consentId,
      provider,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
    }, { onConflict: 'consent_id' });
  }

  // Update consent status to Accepted (1)
  const now = new Date().toISOString();
  const newEtag = randomUUID();
  await supabase.from('consents').update({ status: 1, etag: newEtag, updated_at: now }).eq('id', consentId);

  return NextResponse.json({ success: true, consentId });
}
