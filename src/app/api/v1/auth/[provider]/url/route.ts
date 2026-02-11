import { NextResponse } from 'next/server';
import { validateProvider } from '@/lib/api/oauth-config';
import { getOAuthConfig } from '@/lib/api/oauth-config';
import { buildFortnoxAuthUrl } from '@/lib/providers/fortnox/oauth';
import { buildVismaAuthUrl } from '@/lib/providers/visma/oauth';

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!validateProvider(provider)) {
    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  }

  if (provider === 'briox') {
    return NextResponse.json({ error: 'Briox uses application tokens, not OAuth. Use the callback endpoint with an application token.' }, { status: 400 });
  }
  if (provider === 'bokio') {
    return NextResponse.json({ error: 'Bokio uses private API tokens, not OAuth. Use the callback endpoint with an API token and company ID.' }, { status: 400 });
  }
  if (provider === 'bjornlunden') {
    return NextResponse.json({ error: 'Björn Lunden uses client credentials. Use the callback endpoint with a company key.' }, { status: 400 });
  }

  const config = getOAuthConfig(provider);
  const url = new URL(request.url);
  const scopes = url.searchParams.get('scopes')?.split(',');
  const state = url.searchParams.get('state') ?? undefined;

  let authUrl: string;
  if (provider === 'fortnox') {
    authUrl = buildFortnoxAuthUrl(config, { scopes: scopes ?? undefined, state });
  } else {
    authUrl = buildVismaAuthUrl(config, { scopes: scopes ?? undefined, state });
  }

  return NextResponse.json({ url: authUrl });
}
