import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { resolveConsent } from '@/lib/api/resolve-consent';
import { loadManualSieParsed } from '@/lib/sie/fetch-sie';
import { calculateKPIs } from '@/lib/sie/kpi';
import { getJournalKPIs, getMonthlyJournalKPIs } from '@/lib/sie/journal-kpis';
import { calculateMonthlyKPIsFromSIE } from '@/lib/sie/monthly-kpis';

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

  // Parse query params
  const url = new URL(request.url);
  const startDate = url.searchParams.get('startDate') ?? undefined;
  const endDate = url.searchParams.get('endDate') ?? undefined;
  const granularity = url.searchParams.get('granularity');

  try {
    if (provider === 'manual-sie') {
      const parsed = await loadManualSieParsed(consentId);
      if (!parsed) {
        return NextResponse.json(
          { error: 'No SIE data found for this consent' },
          { status: 404 },
        );
      }

      // Monthly granularity for manual-sie
      if (granularity === 'monthly') {
        if (parsed.transactions.length === 0) {
          return NextResponse.json(
            { error: 'No transaction data available for monthly KPI calculation. The SIE file must contain transaction-level data (#VER/#TRANS records).' },
            { status: 422 },
          );
        }

        const series = calculateMonthlyKPIsFromSIE(parsed);
        return NextResponse.json({
          data: series,
          metadata: {
            provider,
            companyName: parsed.metadata.companyName,
            orgNumber: parsed.metadata.orgNumber ?? null,
          },
        });
      }

      // Default: annual KPIs
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

    // All other providers: synced data
    if (granularity === 'monthly') {
      const result = await getMonthlyJournalKPIs(consentId, { startDate, endDate });

      return NextResponse.json({
        data: result.series,
        metadata: {
          provider,
          ...result.metadata,
        },
      });
    }

    // Default: annual KPIs
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
    const status = message.includes('No transaction data') || message.includes('No journal data')
      ? 422
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
