'use client';

import { useState, useEffect, useCallback } from 'react';
import { HeadlineStats, KPIDetailTables, type KPIValues } from '@/components/shared/kpi-display';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BalanceComposition } from '@/components/charts/balance-composition';
import { MarginBars } from '@/components/charts/margin-bars';
import { LiquidityGauge } from '@/components/charts/liquidity-gauge';
import { CapitalDonut } from '@/components/charts/capital-donut';
import { KPITrend } from '@/components/charts/kpi-trend';
import type { MonthlyKPISeries, MonthlyKPIEntry } from '@/lib/sie/types';

interface KPIMetadata {
  provider: string;
  source?: 'account-balances' | 'journals';
  // manual-sie fields
  companyName?: string;
  orgNumber?: string | null;
  fiscalYearStart?: string | null;
  fiscalYearEnd?: string | null;
  // synced data fields
  startDate?: string;
  endDate?: string;
  accountCount?: number;
  journalCount?: number;
  entryCount?: number;
  reconciled?: boolean;
  reconciliationDrift?: number;
}

interface KPIPanelProps {
  consentId: string;
  provider: string;
}

function defaultDates() {
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86_400_000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-serif text-lg tracking-wide text-foreground/80">
      {children}
    </h3>
  );
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'January', '02': 'February', '03': 'March', '04': 'April',
  '05': 'May', '06': 'June', '07': 'July', '08': 'August',
  '09': 'September', '10': 'October', '11': 'November', '12': 'December',
};

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split('-');
  return `${MONTH_LABELS[month!] ?? month} ${year}`;
}

export function KPIPanel({ consentId, provider }: KPIPanelProps) {
  const isManualSie = provider === 'manual-sie';
  const defaults = defaultDates();

  const [kpis, setKpis] = useState<KPIValues | null>(null);
  const [metadata, setMetadata] = useState<KPIMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [detailsOpen, setDetailsOpen] = useState(true);

  // Monthly state
  const [monthlyData, setMonthlyData] = useState<MonthlyKPISeries | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const fetchKpis = useCallback(async (start?: string, end?: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (!isManualSie && start) params.set('startDate', start);
      if (!isManualSie && end) params.set('endDate', end);
      const qs = params.toString();
      const url = `/api/v1/consents/${consentId}/kpis${qs ? `?${qs}` : ''}`;

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load KPIs (${res.status})`);
      }

      const json = await res.json();
      setKpis(json.data);
      setMetadata(json.metadata);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load KPIs');
    } finally {
      setLoading(false);
    }
  }, [consentId, isManualSie]);

  const fetchMonthly = useCallback(async () => {
    setMonthlyLoading(true);
    setMonthlyError(null);

    try {
      const params = new URLSearchParams({ granularity: 'monthly' });
      if (!isManualSie) {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }
      const url = `/api/v1/consents/${consentId}/kpis?${params.toString()}`;

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load monthly KPIs (${res.status})`);
      }

      const json = await res.json();
      setMonthlyData(json.data as MonthlyKPISeries);
      setSelectedMonth(null);
    } catch (err) {
      setMonthlyError(err instanceof Error ? err.message : 'Failed to load monthly KPIs');
    } finally {
      setMonthlyLoading(false);
    }
  }, [consentId, isManualSie, startDate, endDate]);

  useEffect(() => {
    fetchKpis(startDate, endDate);
  }, [fetchKpis]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCompute = () => {
    fetchKpis(startDate, endDate);
  };

  // Determine which KPIs to display in the main charts
  const selectedMonthEntry: MonthlyKPIEntry | undefined =
    selectedMonth && monthlyData
      ? monthlyData.months.find((m) => m.month === selectedMonth)
      : undefined;
  const displayKpis: KPIValues | null = selectedMonthEntry
    ? (selectedMonthEntry.kpis as unknown as KPIValues)
    : kpis;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading KPIs...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!displayKpis) return null;

  return (
    <div className="space-y-8">
      {/* Date range picker (hidden for manual-sie and account-balances source) */}
      {!isManualSie && metadata?.source !== 'account-balances' && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 py-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Start date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">End date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={handleCompute} size="sm">
              Compute
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Warning: journal fallback */}
      {metadata && metadata.source === 'journals' && (
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-amber-600">
              Using journal-based computation — values may differ from official reports.
            </p>
            {metadata.reconciled === false && (
              <p className="text-sm text-destructive mt-1">
                Reconciliation failed: debit/credit drift of {metadata.reconciliationDrift?.toFixed(2)}.
                Sync may be incomplete.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      {metadata && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 py-4">
            {metadata.companyName && (
              <span className="text-sm font-medium">{metadata.companyName}</span>
            )}
            {metadata.orgNumber && (
              <Badge variant="secondary">{metadata.orgNumber}</Badge>
            )}
            {metadata.fiscalYearStart && metadata.fiscalYearEnd && (
              <span className="text-sm text-muted-foreground">
                Fiscal year: {metadata.fiscalYearStart} — {metadata.fiscalYearEnd}
              </span>
            )}
            {metadata.startDate && metadata.endDate && (
              <span className="text-sm text-muted-foreground">
                Period: {metadata.startDate} — {metadata.endDate}
              </span>
            )}
            {metadata.source && (
              <Badge variant={metadata.source === 'account-balances' ? 'default' : 'secondary'}>
                {metadata.source === 'account-balances' ? 'Account Balances' : 'Journals'}
              </Badge>
            )}
            {metadata.accountCount != null && metadata.accountCount > 0 && (
              <Badge variant="secondary">
                {metadata.accountCount} accounts
              </Badge>
            )}
            {metadata.journalCount != null && (
              <Badge variant="secondary">
                {metadata.journalCount} journals / {metadata.entryCount ?? 0} entries
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Monthly Trends ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader>Monthly Trends</SectionHeader>
          <div className="flex items-center gap-3">
            {monthlyData && (
              <Select
                value={selectedMonth ?? ''}
                onChange={(e) => setSelectedMonth(e.target.value || null)}
                className="w-48"
              >
                <option value="">All months (aggregate)</option>
                {monthlyData.months.map((m) => (
                  <option key={m.month} value={m.month}>
                    {formatMonthLabel(m.month)}
                  </option>
                ))}
              </Select>
            )}
            {!monthlyData && (
              <Button
                onClick={fetchMonthly}
                size="sm"
                variant="secondary"
                disabled={monthlyLoading}
              >
                {monthlyLoading ? 'Loading...' : 'Load Monthly Trends'}
              </Button>
            )}
          </div>
        </div>

        {selectedMonth && (
          <Badge variant="secondary">
            Viewing: {formatMonthLabel(selectedMonth)}
          </Badge>
        )}

        {monthlyError && (
          <Card>
            <CardContent className="py-3">
              <p className="text-sm text-destructive">{monthlyError}</p>
            </CardContent>
          </Card>
        )}

        {monthlyData && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Revenue & Profitability</CardTitle>
              </CardHeader>
              <CardContent>
                <KPITrend
                  series={monthlyData.months}
                  metrics={[
                    { key: 'netSales', label: 'Net Sales', format: 'sek' },
                    { key: 'ebitda', label: 'EBITDA', format: 'sek' },
                    { key: 'netIncome', label: 'Net Income', format: 'sek' },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Margins</CardTitle>
              </CardHeader>
              <CardContent>
                <KPITrend
                  series={monthlyData.months}
                  metrics={[
                    { key: 'grossMargin', label: 'Gross', format: 'pct' },
                    { key: 'operatingMargin', label: 'Operating', format: 'pct' },
                    { key: 'netMargin', label: 'Net', format: 'pct' },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Liquidity</CardTitle>
              </CardHeader>
              <CardContent>
                <KPITrend
                  series={monthlyData.months}
                  metrics={[
                    { key: 'currentRatio', label: 'Current Ratio', format: 'ratio' },
                    { key: 'quickRatio', label: 'Quick Ratio', format: 'ratio' },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Balance Sheet</CardTitle>
              </CardHeader>
              <CardContent>
                <KPITrend
                  series={monthlyData.months}
                  metrics={[
                    { key: 'totalAssets', label: 'Total Assets', format: 'sek' },
                    { key: 'adjustedEquity', label: 'Adj. Equity', format: 'sek' },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* ── Executive Summary ── */}
      <section className="space-y-4">
        <SectionHeader>Executive Summary</SectionHeader>
        <HeadlineStats kpis={displayKpis} />
      </section>

      {/* ── Profitability ── */}
      <section className="space-y-4">
        <SectionHeader>Profitability</SectionHeader>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Margins</CardTitle>
            </CardHeader>
            <CardContent>
              <MarginBars kpis={displayKpis} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Returns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 py-4">
                {[
                  { label: 'Return on Assets (ROA)', key: 'roa' },
                  { label: 'Return on Equity (ROE)', key: 'roe' },
                  { label: 'Return on Capital Employed (ROCE)', key: 'roce' },
                ].map(({ label, key }) => {
                  const v = displayKpis[key];
                  const val = typeof v === 'number' ? v : null;
                  const color = val == null ? 'text-muted-foreground' : val >= 0 ? 'text-green-400/70' : 'text-red-400/70';
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <span className={`text-lg font-mono font-semibold tabular-nums ${color}`}>
                        {val != null ? `${val.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Financial Position ── */}
      <section className="space-y-4">
        <SectionHeader>Financial Position</SectionHeader>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Balance Composition</CardTitle>
          </CardHeader>
          <CardContent>
            <BalanceComposition kpis={displayKpis} />
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Liquidity Ratios</CardTitle>
            </CardHeader>
            <CardContent>
              <LiquidityGauge kpis={displayKpis} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Capital Structure</CardTitle>
            </CardHeader>
            <CardContent>
              <CapitalDonut kpis={displayKpis} />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Detailed Breakdown ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader>Detailed Breakdown</SectionHeader>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="text-xs text-muted-foreground"
          >
            {detailsOpen ? 'Collapse' : 'Expand'}
          </Button>
        </div>
        {detailsOpen && <KPIDetailTables kpis={displayKpis} />}
      </section>
    </div>
  );
}
