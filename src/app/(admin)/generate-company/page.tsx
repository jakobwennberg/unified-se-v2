'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sparkles, Download, Copy, CheckCircle2, TriangleAlert } from 'lucide-react';
import type { SIEParseResult } from '@/lib/sie/types';
import { KPIDetailTables, type KPIValues } from '@/components/shared/kpi-display';
import { GenerationProgress } from './generation-progress';
import { CompanyHeader } from './company-header';
import { HeadlineStats } from './headline-stats';
import { DataOverview } from './data-overview';

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

export default function GenerateCompanyPage() {
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
      // Brief delay so user sees the rapid-complete animation
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Generate Company</h1>
        <p className="text-sm text-muted-foreground">
          Generate a realistic fictional Swedish company with full SIE4 accounting data.
        </p>
      </div>

      {/* Config card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
          <CardDescription>Choose industry, size, and fiscal year for the generated company.</CardDescription>
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
          <CompanyHeader
            companyName={result.profile.companyName}
            description={result.profile.description}
            orgNumber={result.profile.orgNumber}
            industry={result.profile.industry}
            size={result.profile.size}
            fiscalYear={fiscalYear}
          />

          {/* Headline Stats */}
          <HeadlineStats kpis={result.kpis} />

          {/* Tabs */}
          <Tabs defaultValue="financial-details">
            <TabsList>
              <TabsTrigger value="financial-details">Financial Details</TabsTrigger>
              <TabsTrigger value="sie">SIE File</TabsTrigger>
              <TabsTrigger value="data-overview">Data Overview</TabsTrigger>
            </TabsList>

            {/* Financial Details tab */}
            <TabsContent value="financial-details">
              <KPIDetailTables kpis={result.kpis} />
            </TabsContent>

            {/* SIE File tab */}
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

            {/* Data Overview tab */}
            <TabsContent value="data-overview">
              {result.sieData && <DataOverview sieData={result.sieData} />}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

/** Number of steps in the progress stepper — used for rapid-complete delay */
const STEPS_COUNT = 5;
