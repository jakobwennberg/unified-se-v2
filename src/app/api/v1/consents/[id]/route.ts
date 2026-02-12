import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { randomUUID } from 'node:crypto';

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: consentId } = await params;
  const supabase = getServiceClient();

  // Try normal authentication first (API key or session)
  const auth = await authenticateRequest(request);
  if (auth) {
    const { data: rows } = await supabase
      .from('consents')
      .select('id, tenant_id, name, status, provider, org_number, company_name, system_settings_id, etag, created_at, updated_at, expires_at')
      .eq('id', consentId)
      .eq('tenant_id', auth.tenantId)
      .limit(1);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Consent not found' }, { status: 404 });
    }

    return NextResponse.json(rows[0], { status: 200, headers: { 'ETag': rows[0]!.etag } });
  }

  // Fallback: OTC-based access for onboarding links
  const url = new URL(request.url);
  const otc = url.searchParams.get('otc');
  if (otc) {
    const { data: otcRows } = await supabase
      .from('one_time_codes')
      .select('consent_id, expires_at, used_at')
      .eq('code', otc)
      .eq('consent_id', consentId)
      .limit(1);

    if (!otcRows || otcRows.length === 0) {
      return NextResponse.json({ error: 'Consent not found or invalid link' }, { status: 404 });
    }

    const otcRecord = otcRows[0]!;
    if (otcRecord.used_at || new Date(otcRecord.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Link has expired' }, { status: 410 });
    }

    const { data: rows } = await supabase
      .from('consents')
      .select('id, name, status, provider, company_name, etag')
      .eq('id', consentId)
      .limit(1);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Consent not found or invalid link' }, { status: 404 });
    }

    return NextResponse.json(rows[0], { status: 200 });
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: consentId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = getServiceClient();

  const ifMatch = request.headers.get('If-Match');
  const { data: existing } = await supabase
    .from('consents')
    .select('etag')
    .eq('id', consentId)
    .eq('tenant_id', auth.tenantId)
    .limit(1);

  if (!existing || existing.length === 0) {
    return NextResponse.json({ error: 'Consent not found' }, { status: 404 });
  }

  if (ifMatch && ifMatch !== existing[0]!.etag) {
    return NextResponse.json({ error: 'ETag mismatch — consent was modified' }, { status: 412 });
  }

  const newEtag = randomUUID();
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { etag: newEtag, updated_at: now };
  if (body.name != null) updates.name = body.name;
  if (body.status != null) updates.status = body.status;
  if (body.provider != null) updates.provider = body.provider;
  if (body.orgNumber != null) updates.org_number = body.orgNumber;
  if (body.companyName != null) updates.company_name = body.companyName;
  if (body.systemSettingsId != null) updates.system_settings_id = body.systemSettingsId;

  await supabase.from('consents').update(updates).eq('id', consentId).eq('tenant_id', auth.tenantId);

  const { data: rows } = await supabase.from('consents').select('*').eq('id', consentId);
  return NextResponse.json(rows?.[0] ?? {}, { status: 200, headers: { 'ETag': newEtag } });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: consentId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getServiceClient();
  await supabase.from('consent_tokens').delete().eq('consent_id', consentId);
  await supabase.from('one_time_codes').delete().eq('consent_id', consentId);
  await supabase.from('consents').delete().eq('id', consentId).eq('tenant_id', auth.tenantId);

  return NextResponse.json({ success: true });
}
