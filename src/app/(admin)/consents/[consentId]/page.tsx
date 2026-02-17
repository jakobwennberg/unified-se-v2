'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ResourceBrowser } from '@/components/shared/resource-browser';
import { createApiClient } from '@/lib/hooks/use-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { OnboardingLink } from '@/components/admin/onboarding-link';
import { ArrowLeft, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { KPIPanel } from './kpi-panel';
import { ConsentChat } from '@/components/admin/consent-chat';

const STATUS_VARIANTS: Record<number, 'warning' | 'success' | 'destructive' | 'secondary'> = {
  0: 'warning',
  1: 'success',
  2: 'destructive',
  3: 'secondary',
};

const STATUS_LABELS: Record<number, string> = {
  0: 'Created',
  1: 'Accepted',
  2: 'Revoked',
  3: 'Inactive',
};

const PROVIDER_LABELS: Record<string, string> = {
  fortnox: 'Fortnox',
  visma: 'Visma eEkonomi',
  bokio: 'Bokio',
  bjornlunden: 'Bjorn Lunden',
  'manual-sie': 'Manual SIE Upload',
};

const RESOURCE_LABELS: Record<string, string> = {
  salesinvoices: 'Sales Invoices',
  supplierinvoices: 'Supplier Invoices',
  customers: 'Customers',
  suppliers: 'Suppliers',
  journals: 'Journals',
  accountingaccounts: 'Accounts',
  companyinformation: 'Company Info',
  payments: 'Payments',
  accountingperiods: 'Periods',
  financialdimensions: 'Dimensions',
  balancesheet: 'Balance Sheet',
  incomestatement: 'Income Statement',
  trialbalance: 'Trial Balance',
  attachments: 'Attachments',
};

interface ConsentDetail {
  id: string;
  name: string;
  provider: string | null;
  company_name: string | null;
  org_number: string | null;
  status: number;
  etag: string;
  created_at: string;
  updated_at: string;
  system_settings_id: string | null;
}

interface SyncResourceState {
  resource_type: string;
  status: string;
  records_synced?: number;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
}

interface SyncStatusResponse {
  consentId: string;
  overallStatus: 'idle' | 'syncing' | 'completed' | 'partial' | 'failed';
  summary: { syncing: number; completed: number; failed: number; total: number };
  resources: SyncResourceState[];
}

function SyncOverlay({ consentId }: { consentId: string }) {
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startTimeRef.current = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/consents/${consentId}/sync/status`);
        if (res.ok && active) {
          setSyncStatus(await res.json());
        }
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { active = false; clearInterval(id); };
  }, [consentId]);

  if (!syncStatus) return null;

  const { summary, resources } = syncStatus;
  const done = summary.completed + summary.failed;
  const pct = summary.total > 0 ? Math.round((done / summary.total) * 100) : 0;

  // Estimate remaining time based on elapsed and progress
  const elapsedSec = Math.floor(elapsed / 1000);
  let estimateText = 'Estimating...';
  if (done > 0 && done < summary.total) {
    const avgPerResource = elapsed / done;
    const remaining = Math.ceil(((summary.total - done) * avgPerResource) / 1000 / 60);
    estimateText = `~${remaining <= 1 ? 1 : remaining} min remaining (up to 15 min on free plan)`;
  } else if (done === 0 && elapsedSec > 5) {
    estimateText = 'Starting sync...';
  } else if (done >= summary.total) {
    estimateText = 'Finishing up...';
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      <div className="text-center space-y-1">
        <p className="text-lg font-semibold">Syncing data from provider</p>
        <p className="text-sm text-muted-foreground">{estimateText}</p>
        <p className="text-xs text-muted-foreground/70 mt-2">
          This may take up to 15 minutes on the free plan due to provider rate limits.
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1 text-center">
          {done} / {summary.total} resource types
        </p>
      </div>

      {/* Per-resource breakdown */}
      <div className="w-full max-w-md space-y-1.5">
        {resources.map((r) => (
          <div key={r.resource_type} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {RESOURCE_LABELS[r.resource_type] ?? r.resource_type}
            </span>
            <span className="flex items-center gap-1.5">
              {r.status === 'syncing' && (
                <><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /><span className="text-primary">Syncing</span></>
              )}
              {r.status === 'completed' && (
                <><CheckCircle2 className="h-3.5 w-3.5 text-[#3fb950]" /><span className="text-[#3fb950]">{r.records_synced ?? 0} records</span></>
              )}
              {r.status === 'failed' && (
                <><XCircle className="h-3.5 w-3.5 text-destructive" /><span className="text-destructive">Failed</span></>
              )}
              {r.status === 'idle' && (
                <span className="text-muted-foreground">Pending</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ConsentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const consentId = params.consentId as string;

  const [consent, setConsent] = useState<ConsentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasSyncedData, setHasSyncedData] = useState(false);

  // Create API client that proxies through our route handler
  const apiClient = useMemo(
    () => createApiClient(''),
    [],
  );

  const fetchConsent = useCallback(async () => {
    const res = await fetch(`/api/v1/consents/${consentId}`);
    if (res.ok) {
      const data = await res.json();
      setConsent(data);
    }
    setLoading(false);
  }, [consentId]);

  // Check sync status on mount, then poll every 3s while syncing
  useEffect(() => {
    let active = true;
    const checkSync = async () => {
      try {
        const res = await fetch(`/api/v1/consents/${consentId}/sync/status`);
        if (!res.ok || !active) return;
        const data: SyncStatusResponse = await res.json();
        setSyncing(data.overallStatus === 'syncing');
        if (data.summary.completed > 0) {
          setHasSyncedData(true);
        }
      } catch { /* ignore */ }
    };
    checkSync();
    // Always poll — 3s while syncing, 30s otherwise (to detect background syncs)
    const id = setInterval(checkSync, syncing ? 3000 : 30000);
    return () => { active = false; clearInterval(id); };
  }, [consentId, syncing]);

  useEffect(() => {
    fetchConsent();
  }, [fetchConsent]);

  const handleRevoke = async () => {
    if (!consent) return;
    if (!confirm('Are you sure you want to revoke this consent?')) return;

    setRevoking(true);
    try {
      await fetch(`/api/v1/consents/${consentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': consent.etag,
        },
        body: JSON.stringify({ status: 2 }),
      });
      fetchConsent();
    } finally {
      setRevoking(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading consent...</p>;
  }

  if (!consent) {
    return <p className="text-destructive">Consent not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/consents')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{consent.name}</h1>
        <Badge variant={STATUS_VARIANTS[consent.status] ?? 'secondary'}>
          {STATUS_LABELS[consent.status] ?? 'Unknown'}
        </Badge>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="data">Data Explorer</TabsTrigger>
          {consent.status === 1 && <TabsTrigger value="kpis">KPIs</TabsTrigger>}
          {consent.status === 1 && <TabsTrigger value="chat">AI Chat</TabsTrigger>}
          <TabsTrigger value="onboarding">Onboarding Link</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Consent Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-6 text-sm">
                <div className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">ID</dt>
                  <dd className="font-mono text-xs text-muted-foreground">{consent.id}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Provider</dt>
                  <dd className="font-medium">{consent.provider ? (PROVIDER_LABELS[consent.provider] ?? consent.provider) : 'Awaiting customer selection'}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Company</dt>
                  <dd className="font-medium">{consent.company_name ?? '—'}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Org Number</dt>
                  <dd className="font-medium">{consent.org_number ?? '—'}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Created</dt>
                  <dd className="font-medium">{new Date(consent.created_at).toLocaleString()}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Updated</dt>
                  <dd className="font-medium">{new Date(consent.updated_at).toLocaleString()}</dd>
                </div>
              </dl>

              {consent.status === 1 && (
                <div className="mt-6">
                  <Button
                    variant="destructive"
                    onClick={handleRevoke}
                    disabled={revoking}
                  >
                    {revoking ? 'Revoking...' : 'Revoke Consent'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <Card>
            <CardContent className="pt-6">
              {consent.status === 1 && syncing ? (
                <SyncOverlay consentId={consentId} />
              ) : consent.status === 1 ? (
                <ResourceBrowser api={apiClient} consentId={consentId} provider={consent.provider!} useStoredData={hasSyncedData} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Data Explorer is only available for accepted consents.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {consent.status === 1 && (
          <TabsContent value="kpis">
            {syncing ? (
              <Card>
                <CardContent className="pt-6">
                  <SyncOverlay consentId={consentId} />
                </CardContent>
              </Card>
            ) : (
              <KPIPanel consentId={consentId} provider={consent.provider!} />
            )}
          </TabsContent>
        )}

        {consent.status === 1 && (
          <TabsContent value="chat">
            {syncing ? (
              <Card>
                <CardContent className="pt-6">
                  <SyncOverlay consentId={consentId} />
                </CardContent>
              </Card>
            ) : (
              <ConsentChat consentId={consentId} />
            )}
          </TabsContent>
        )}

        <TabsContent value="onboarding">
          <OnboardingLink consentId={consentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
