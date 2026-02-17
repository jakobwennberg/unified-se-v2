import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { parseSIE, decodeSIEBuffer } from '@/lib/providers/manual-sie/parser';
import { randomUUID } from 'node:crypto';

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Validate access via API key/session auth OR one-time-code (otc) query param.
 * Returns the consent row if authorized, null otherwise.
 */
async function authorizeUpload(
  request: Request,
  consentId: string,
): Promise<{ consent: Record<string, unknown> } | null> {
  const supabase = getServiceClient();

  // Try standard auth first (API key or session)
  const auth = await authenticateRequest(request);
  if (auth) {
    const { data: rows } = await supabase
      .from('consents')
      .select('*')
      .eq('id', consentId)
      .eq('tenant_id', auth.tenantId)
      .limit(1);

    if (rows && rows.length > 0) {
      return { consent: rows[0]! };
    }
  }

  // Try OTC (one-time-code) from query param — used by onboarding page
  const url = new URL(request.url);
  const otc = url.searchParams.get('otc');
  if (otc) {
    const { data: otcRows } = await supabase
      .from('one_time_codes')
      .select('code, consent_id, expires_at, used_at')
      .eq('code', otc)
      .eq('consent_id', consentId)
      .limit(1);

    if (otcRows && otcRows.length > 0) {
      const otcRow = otcRows[0]!;
      // OTC must not be expired (but we allow already-used codes for SIE upload
      // since the user may upload multiple files in one session)
      if (new Date(otcRow.expires_at as string) < new Date()) {
        return null;
      }

      const { data: consentRows } = await supabase
        .from('consents')
        .select('*')
        .eq('id', consentId)
        .limit(1);

      if (consentRows && consentRows.length > 0) {
        return { consent: consentRows[0]! };
      }
    }
  }

  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: consentId } = await params;

  const authorized = await authorizeUpload(request, consentId);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { consent } = authorized;

  if (consent.provider && consent.provider !== 'manual-sie') {
    return NextResponse.json({ error: 'SIE upload is only available for manual-sie consents' }, { status: 400 });
  }

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate file extension
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith('.se') && !fileName.endsWith('.si')) {
    return NextResponse.json({ error: 'Invalid file extension. Expected .se or .si' }, { status: 400 });
  }

  // Read and validate file size
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  if (buffer.length > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 });
  }

  let parsed;
  try {
    const content = decodeSIEBuffer(buffer);
    parsed = parseSIE(content);
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to parse SIE file: ${e instanceof Error ? e.message : 'Unknown error'}` },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const uploadId = randomUUID();

  // Store the parsed data
  await supabase.from('sie_uploads').insert({
    id: uploadId,
    consent_id: consentId,
    file_name: file.name,
    file_size: buffer.length,
    sie_type: parsed.metadata.sieType,
    parsed_data: parsed,
    uploaded_at: new Date().toISOString(),
  });

  // Set consent status to Accepted (1) if this is the first upload
  if (consent.status === 0) {
    const newEtag = randomUUID();
    const now = new Date().toISOString();
    const updateFields: Record<string, unknown> = {
      status: 1,
      etag: newEtag,
      updated_at: now,
      ...(!consent.provider ? { provider: 'manual-sie' } : {}),
    };

    // Auto-populate company name and org number from SIE metadata
    if (parsed.metadata.companyName && parsed.metadata.companyName !== 'Okänd') {
      updateFields.company_name = parsed.metadata.companyName;
    }
    if (parsed.metadata.orgNumber) {
      updateFields.org_number = parsed.metadata.orgNumber;
    }

    await supabase.from('consents').update(updateFields).eq('id', consentId);
  }

  return NextResponse.json({
    id: uploadId,
    fileName: file.name,
    fileSize: buffer.length,
    sieType: parsed.metadata.sieType,
    companyName: parsed.metadata.companyName,
    orgNumber: parsed.metadata.orgNumber,
    stats: {
      accounts: parsed.accounts.length,
      transactions: parsed.transactions.length,
      balances: parsed.balances.length,
      dimensions: parsed.dimensions.length,
    },
  }, { status: 201 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: consentId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Verify consent belongs to tenant
  const { data: consentRows } = await supabase
    .from('consents')
    .select('id')
    .eq('id', consentId)
    .eq('tenant_id', auth.tenantId)
    .limit(1);

  if (!consentRows || consentRows.length === 0) {
    return NextResponse.json({ error: 'Consent not found' }, { status: 404 });
  }

  // List uploads
  const { data: uploads } = await supabase
    .from('sie_uploads')
    .select('id, file_name, file_size, sie_type, uploaded_at')
    .eq('consent_id', consentId)
    .order('uploaded_at', { ascending: false });

  return NextResponse.json({ data: uploads ?? [] });
}
