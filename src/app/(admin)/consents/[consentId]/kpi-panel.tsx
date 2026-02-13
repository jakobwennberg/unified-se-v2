'use client';

import { useState, useEffect, useCallback } from 'react';
import { HeadlineStats, KPIDetailTables, type KPIValues } from '@/components/shared/kpi-display';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

export function KPIPanel({ consentId, provider }: KPIPanelProps) {
  const isManualSie = provider === 'manual-sie';
  const defaults = defaultDates();

  const [kpis, setKpis] = useState<KPIValues | null>(null);
  const [metadata, setMetadata] = useState<KPIMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);

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

  useEffect(() => {
    fetchKpis(startDate, endDate);
  }, [fetchKpis]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCompute = () => {
    fetchKpis(startDate, endDate);
  };

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

  if (!kpis) return null;

  return (
    <div className="space-y-6">
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

      <HeadlineStats kpis={kpis} />
      <KPIDetailTables kpis={kpis} />
    </div>
  );
}
