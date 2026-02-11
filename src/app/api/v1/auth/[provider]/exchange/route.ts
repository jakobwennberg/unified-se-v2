import { NextResponse } from 'next/server';
import { validateProvider, getOAuthConfig } from '@/lib/api/oauth-config';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import type { TokenResponse } from '@/lib/providers/types';
import { exchangeFortnoxCode } from '@/lib/providers/fortnox/oauth';
import { exchangeVismaCode } from '@/lib/providers/visma/oauth';
import { exchangeBrioxCode } from '@/lib/providers/briox/oauth';

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!validateProvider(provider)) {
    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  }

  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { code } = body;
  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  if (provider === 'bokio') {
    return NextResponse.json({ error: 'Bokio uses private API tokens. Use the callback endpoint instead.' }, { status: 400 });
  }
  if (provider === 'bjornlunden') {
    return NextResponse.json({ error: 'Björn Lunden uses client credentials. Use the callback endpoint instead.' }, { status: 400 });
  }

  const config = getOAuthConfig(provider);
  let tokens: TokenResponse;

  if (provider === 'fortnox') {
    tokens = await exchangeFortnoxCode(config, code);
  } else if (provider === 'briox') {
    tokens = await exchangeBrioxCode(config.clientId, code);
  } else {
    tokens = await exchangeVismaCode(config, code);
  }

  return NextResponse.json({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    expires_in: tokens.expires_in,
  });
}
