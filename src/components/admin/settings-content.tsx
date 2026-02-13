'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Download, Copy, CheckCircle2, TriangleAlert } from 'lucide-react';
import type { SIEParseResult } from '@/lib/sie/types';
import { KPIDetailTables, HeadlineStats, type KPIValues } from '@/components/shared/kpi-display';
import { GenerationProgress } from '@/app/(admin)/generate-company/generation-progress';
import { DataOverview } from '@/app/(admin)/generate-company/data-overview';

// ── Types ──

interface Tenant {
  id: string;
  name: string;
  email: string;
  plan: string;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  max_consents: number;
}

interface Profile {
  companyName: string;
  orgNumber: string;
  industry: string;
  size: string;
  description: string;
}

interface GenerateResult {
  profile: Profile;
  sieText: string;
  sieData: SIEParseResult;
  kpis: KPIValues;
}

// ── Constants ──

const INDUSTRIES = [
  { value: '', label: 'Random' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'retail', label: 'Retail' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'construction', label: 'Construction' },
  { value: 'saas', label: 'SaaS / Software' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'transport', label: 'Transport' },
  { value: 'real_estate', label: 'Real Estate' },
] as const;

const SIZES = [
  { value: 'micro', label: 'Micro (1-3 emp, <3M SEK)' },
  { value: 'small', label: 'Small (4-15 emp, 3-20M SEK)' },
  { value: 'medium', label: 'Medium (16-50 emp, 20-100M SEK)' },
] as const;

const STEPS_COUNT = 5;

// ── Component ──

interface SettingsContentProps {
  tenant: Tenant;
}

export function SettingsContent({ tenant }: SettingsContentProps) {
  // Generate company state
  const [industry, setIndustry] = useState('');
  const [size, setSize] = useState('small');
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear() - 1));
  const [includePrevYear, setIncludePrevYear] = useState(true);
  const [loading, setLoading] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setGenerationDone(false);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, unknown> = {
        size,
        fiscalYear: parseInt(fiscalYear, 10),
        includePreviousYear: includePrevYear,
      };
      if (industry) body.industry = industry;

      const res = await fetch('/api/v1/generate/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const json = await res.json();
      setGenerationDone(true);
      await new Promise((r) => setTimeout(r, STEPS_COUNT * 300 + 200));
      setResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result?.sieText) return;
    navigator.clipboard.writeText(result.sieText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!result?.sieText || !result.profile) return;
    const blob = new Blob([result.sieText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = result.profile.companyName.replace(/[^a-zA-Z0-9åäöÅÄÖ\s-]/g, '').replace(/\s+/g, '_');
    a.download = `${safeName}_${fiscalYear}.se`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Account details, configuration, and tools</p>
      </div>

      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="generate-company">Generate Company</TabsTrigger>
        </TabsList>

        {/* Account tab */}
        <TabsContent value="account">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Account</CardTitle>
                <CardDescription>Your account details and plan information.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-6 text-sm">
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</dt>
                    <dd className="font-medium">{tenant.name}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Email</dt>
                    <dd className="font-medium">{tenant.email}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Plan</dt>
                    <dd className="font-medium capitalize">{tenant.plan}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tenant ID</dt>
                    <dd className="font-mono text-xs text-muted-foreground">{tenant.id}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Rate Limits</CardTitle>
                <CardDescription>API rate limits for your current plan.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-6 text-sm">
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Requests per minute</dt>
                    <dd className="font-medium">{tenant.rate_limit_per_minute}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Requests per day</dt>
                    <dd className="font-medium">{tenant.rate_limit_per_day.toLocaleString()}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Max consents</dt>
                    <dd className="font-medium">{tenant.max_consents}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Generate Company tab */}
        <TabsContent value="generate-company">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configuration</CardTitle>
                <CardDescription>Generate a realistic fictional Swedish company with full SIE4 accounting data.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Industry</label>
                    <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                      {INDUSTRIES.map((i) => (
                        <option key={i.value} value={i.value}>{i.label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Size</label>
                    <Select value={size} onChange={(e) => setSize(e.target.value)}>
                      {SIZES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fiscal Year</label>
                    <Input
                      type="number"
                      min={2000}
                      max={2099}
                      value={fiscalYear}
                      onChange={(e) => setFiscalYear(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Previous Year</label>
                    <Select
                      value={includePrevYear ? 'yes' : 'no'}
                      onChange={(e) => setIncludePrevYear(e.target.value === 'yes')}
                    >
                      <option value="yes">Include</option>
                      <option value="no">Skip</option>
                    </Select>
                  </div>
                </div>
                <div className="mt-4">
                  <Button onClick={handleGenerate} disabled={loading}>
                    {loading ? (
                      <>
                        <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate Company
                      </>
                    )}
                  </Button>
                </div>

                {error && (
                  <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Progress tracker */}
            {loading && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Generating Company…</CardTitle>
                </CardHeader>
                <CardContent>
                  <GenerationProgress done={generationDone} />
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-6">
                {/* AI disclaimer */}
                <div className="flex gap-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    <span className="font-medium">AI-generated data.</span>{' '}
                    This company and its SIE file were entirely generated by AI. The financial figures may contain inconsistencies and should not be used as a reference for real accounting.
                  </p>
                </div>

                {/* Company Header */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div>
                        <h2 className="text-xl font-semibold">{result.profile.companyName}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{result.profile.description}</p>
                      </div>
                      <p className="font-mono text-sm text-muted-foreground">{result.profile.orgNumber}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {result.profile.industry.replace('_', ' ')}
                        </Badge>
                        <Badge variant="secondary" className="capitalize">
                          {result.profile.size}
                        </Badge>
                        <Badge variant="outline">FY {fiscalYear}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Headline Stats */}
                <HeadlineStats kpis={result.kpis} />

                {/* Result Tabs */}
                <Tabs defaultValue="financial-details">
                  <TabsList>
                    <TabsTrigger value="financial-details">Financial Details</TabsTrigger>
                    <TabsTrigger value="sie">SIE File</TabsTrigger>
                    <TabsTrigger value="data-overview">Data Overview</TabsTrigger>
                  </TabsList>

                  <TabsContent value="financial-details">
                    <KPIDetailTables kpis={result.kpis} />
                  </TabsContent>

                  <TabsContent value="sie">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">SIE4 File</CardTitle>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleCopy}>
                              {copied ? (
                                <>
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-1 h-3.5 w-3.5" />
                                  Copy
                                </>
                              )}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleDownload}>
                              <Download className="mr-1 h-3.5 w-3.5" />
                              Download .se
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <pre className="max-h-[600px] overflow-auto rounded-md bg-muted p-4 text-xs leading-relaxed">
                          {result.sieText}
                        </pre>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="data-overview">
                    {result.sieData && <DataOverview sieData={result.sieData} />}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
