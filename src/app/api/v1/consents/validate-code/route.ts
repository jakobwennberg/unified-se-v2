import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { code } = body;

  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: rows } = await supabase
    .from('one_time_codes')
    .select('code, consent_id, expires_at, used_at, consents!inner(provider, name)')
    .eq('code', code)
    .limit(1);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 404 });
  }

  const otc = rows[0]!;

  if (otc.used_at) {
    return NextResponse.json({ error: 'Code already used' }, { status: 410 });
  }

  if (new Date(otc.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Code expired' }, { status: 410 });
  }

  const now = new Date().toISOString();
  await supabase.from('one_time_codes').update({ used_at: now }).eq('code', code);

  const consent = otc.consents as unknown as { provider: string; name: string };

  return NextResponse.json({
    consentId: otc.consent_id,
    provider: consent.provider,
    consentName: consent.name,
  });
}
