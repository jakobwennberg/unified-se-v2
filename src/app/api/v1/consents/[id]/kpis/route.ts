import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { resolveConsent } from '@/lib/api/resolve-consent';
import { loadManualSieParsed } from '@/lib/sie/fetch-sie';
import { calculateKPIs } from '@/lib/sie/kpi';
import { getJournalKPIs } from '@/lib/sie/journal-kpis';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: consentId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let resolved;
  try {
    resolved = await resolveConsent(auth.tenantId, consentId);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return NextResponse.json(
      { error: e.message ?? 'Failed to resolve consent' },
      { status: e.status ?? 500 },
    );
  }

  const provider = resolved.consent.provider as string;

  // Parse optional date range from query params
  const url = new URL(request.url);
  const startDate = url.searchParams.get('startDate') ?? undefined;
  const endDate = url.searchParams.get('endDate') ?? undefined;

  try {
    if (provider === 'manual-sie') {
      // Manual SIE: use stored parsed SIE data
      const parsed = await loadManualSieParsed(consentId);
      if (!parsed) {
        return NextResponse.json(
          { error: 'No SIE data found for this consent' },
          { status: 404 },
        );
      }

      const kpis = calculateKPIs(parsed);

      return NextResponse.json({
        data: kpis,
        metadata: {
          provider,
          companyName: parsed.metadata.companyName,
          orgNumber: parsed.metadata.orgNumber ?? null,
          fiscalYearStart: parsed.metadata.fiscalYearStart,
          fiscalYearEnd: parsed.metadata.fiscalYearEnd,
        },
      });
    }

    // All other providers: compute KPIs from synced data
    // Preferred: account balances (IB/UB), fallback: journal entries
    const result = await getJournalKPIs(consentId, { startDate, endDate });

    return NextResponse.json({
      data: result.kpis,
      metadata: {
        provider,
        ...result.metadata,
      },
    });
  } catch (err: unknown) {
    console.error('KPI calculation error:', err);
    const message = err instanceof Error ? err.message : 'Failed to calculate KPIs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
