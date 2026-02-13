'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ── Formatter functions ──

export function formatCompactSEK(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M SEK`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K SEK`;
  return `${sign}${abs.toFixed(0)} SEK`;
}

export function formatSEK(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('sv-SE', { style: 'decimal', maximumFractionDigits: 0 }).format(value) + ' SEK';
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}%`;
}

export function formatRatio(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

// ── Color helpers ──

type Sentiment = 'positive' | 'negative' | 'neutral';

function getSEKSentiment(value: number | null | undefined): Sentiment {
  if (value == null) return 'neutral';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function getPctSentiment(value: number | null | undefined): Sentiment {
  if (value == null) return 'neutral';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function getRatioSentiment(key: string, value: number | null | undefined): Sentiment {
  if (value == null) return 'neutral';
  // Liquidity ratios: > 1 is good
  if (key === 'cashRatio' || key === 'quickRatio' || key === 'currentRatio') {
    if (value >= 1.5) return 'positive';
    if (value < 1.0) return 'negative';
    return 'neutral';
  }
  // Debt/equity: lower is better
  if (key === 'debtToEquityRatio' || key === 'deRatio') {
    if (value <= 1.0) return 'positive';
    if (value > 3.0) return 'negative';
    return 'neutral';
  }
  return 'neutral';
}

function getStatSentiment(key: string, value: number | null | undefined): Sentiment {
  if (value == null) return 'neutral';
  // P&L items where positive is good
  if (['netSales', 'netIncome', 'ebitda', 'cashAndBank'].includes(key)) {
    return getSEKSentiment(value);
  }
  // Margin/pct items
  if (['operatingMargin', 'equityRatio', 'roe'].includes(key)) {
    return getPctSentiment(value);
  }
  // Current ratio
  if (key === 'currentRatio') {
    return getRatioSentiment(key, value);
  }
  return 'neutral';
}

function sentimentColor(s: Sentiment): string {
  if (s === 'positive') return 'text-green-400/70';
  if (s === 'negative') return 'text-red-400/70';
  return '';
}

function sentimentBorder(s: Sentiment): string {
  if (s === 'positive') return 'border-l-green-500/40';
  if (s === 'negative') return 'border-l-red-500/40';
  return 'border-l-border';
}

// ── KPI group definitions ──

export const KPI_GROUPS = [
  {
    title: 'Income Statement',
    items: [
      ['Net Sales', 'netSales', 'sek'],
      ['Total Operating Income', 'totalOperatingIncome', 'sek'],
      ['Cost of Goods Sold', 'costOfGoodsSold', 'sek'],
      ['Gross Profit', 'grossProfit', 'sek'],
      ['External Costs', 'externalCosts', 'sek'],
      ['Personnel Costs', 'personnelCosts', 'sek'],
      ['Depreciation', 'depreciation', 'sek'],
      ['EBITDA', 'ebitda', 'sek'],
      ['EBIT', 'ebit', 'sek'],
      ['Financial Net', 'financialNet', 'sek'],
      ['Result Before Tax', 'resultBeforeTax', 'sek'],
      ['Tax', 'tax', 'sek'],
      ['Net Income', 'netIncome', 'sek'],
    ],
  },
  {
    title: 'Balance Sheet',
    items: [
      ['Total Assets', 'totalAssets', 'sek'],
      ['Fixed Assets', 'fixedAssets', 'sek'],
      ['Current Assets', 'currentAssets', 'sek'],
      ['Inventory', 'inventory', 'sek'],
      ['Customer Receivables', 'customerReceivables', 'sek'],
      ['Cash & Bank', 'cashAndBank', 'sek'],
      ['Adjusted Equity', 'adjustedEquity', 'sek'],
      ['  of which Owner Reclass.', 'ownerEquityAdjustment', 'sek'],
      ['Current Liabilities', 'currentLiabilities', 'sek'],
      ['Total Liabilities', 'totalLiabilities', 'sek'],
      ['Net Debt', 'netDebt', 'sek'],
    ],
  },
  {
    title: 'Margins',
    items: [
      ['Gross Margin', 'grossMargin', 'pct'],
      ['EBITDA Margin', 'ebitdaMargin', 'pct'],
      ['Operating Margin', 'operatingMargin', 'pct'],
      ['Profit Margin', 'profitMargin', 'pct'],
      ['Net Margin', 'netMargin', 'pct'],
    ],
  },
  {
    title: 'Returns',
    items: [
      ['ROA', 'roa', 'pct'],
      ['ROE', 'roe', 'pct'],
      ['ROCE', 'roce', 'pct'],
    ],
  },
  {
    title: 'Liquidity',
    items: [
      ['Cash Ratio', 'cashRatio', 'ratio'],
      ['Quick Ratio', 'quickRatio', 'ratio'],
      ['Current Ratio', 'currentRatio', 'ratio'],
      ['Working Capital', 'workingCapital', 'sek'],
    ],
  },
  {
    title: 'Capital Structure',
    items: [
      ['Equity Ratio (Soliditet)', 'equityRatio', 'pct'],
      ['Debt/Equity', 'debtToEquityRatio', 'ratio'],
      ['D/E (Interest-bearing)', 'deRatio', 'ratio'],
      ['Interest Coverage', 'interestCoverageRatio', 'ratio'],
    ],
  },
  {
    title: 'Efficiency',
    items: [
      ['DIO (days)', 'dio', 'ratio'],
      ['DSO (days)', 'dso', 'ratio'],
      ['DPO (days)', 'dpo', 'ratio'],
      ['Cash Conversion Cycle', 'ccc', 'ratio'],
      ['Asset Turnover', 'assetTurnover', 'ratio'],
    ],
  },
  {
    title: 'Growth (YoY)',
    items: [
      ['Revenue Growth', 'revenueGrowth', 'pct'],
      ['Asset Growth', 'assetGrowth', 'pct'],
      ['Equity Growth', 'equityGrowth', 'pct'],
    ],
  },
] as const;

// ── KPI value type ──

export interface KPIValues {
  [key: string]: number | null | boolean;
}

function formatKPIValue(key: string, type: string, kpis: KPIValues): string {
  const val = kpis[key];
  if (val == null || typeof val === 'boolean') return '—';
  if (type === 'sek') return formatSEK(val as number);
  if (type === 'pct') return formatPct(val as number);
  return formatRatio(val as number);
}

/** Determine value color for detail table rows */
function getDetailValueSentiment(key: string, type: string, value: number | null | boolean | undefined): Sentiment {
  if (value == null || typeof value === 'boolean') return 'neutral';
  const v = value as number;
  // Income statement items: profit lines are green if positive, cost lines are expected negative
  if (type === 'sek') {
    // Revenue, profit, subtotals — positive is good
    if (['netSales', 'totalOperatingIncome', 'grossProfit', 'ebitda', 'ebit', 'resultBeforeTax', 'netIncome', 'cashAndBank', 'adjustedEquity', 'workingCapital'].includes(key)) {
      return getSEKSentiment(v);
    }
    return 'neutral';
  }
  if (type === 'pct') return getPctSentiment(v);
  if (type === 'ratio') return getRatioSentiment(key, v);
  return 'neutral';
}

// ── Headline Stats component ──

interface StatDef {
  label: string;
  key: string;
  format: (v: number | null | undefined) => string;
}

const STATS: StatDef[][] = [
  [
    { label: 'Revenue', key: 'netSales', format: formatCompactSEK },
    { label: 'Net Income', key: 'netIncome', format: formatCompactSEK },
    { label: 'Operating Margin', key: 'operatingMargin', format: formatPct },
    { label: 'Equity Ratio', key: 'equityRatio', format: formatPct },
  ],
  [
    { label: 'EBITDA', key: 'ebitda', format: formatCompactSEK },
    { label: 'Cash & Bank', key: 'cashAndBank', format: formatCompactSEK },
    { label: 'Current Ratio', key: 'currentRatio', format: formatRatio },
    { label: 'ROE', key: 'roe', format: formatPct },
  ],
];

interface HeadlineStatsProps {
  kpis: KPIValues;
}

export function HeadlineStats({ kpis }: HeadlineStatsProps) {
  return (
    <div className="space-y-3">
      {STATS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {row.map((stat) => {
            const raw = kpis[stat.key];
            const value = typeof raw === 'number' ? raw : null;
            return (
              <Card key={stat.key} className="border-l-3 border-l-border">
                <CardContent className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-xl font-semibold font-mono tabular-nums">
                    {stat.format(value)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── KPI Detail Tables component ──

interface KPIDetailTablesProps {
  kpis: KPIValues;
}

export function KPIDetailTables({ kpis }: KPIDetailTablesProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {KPI_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">{group.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {group.items.map(([label, key, type]) => {
                  const val = kpis[key];
                  const sentiment = getDetailValueSentiment(key, type, val);
                  return (
                    <tr key={key} className="border-b last:border-0">
                      <td className="py-1.5 text-muted-foreground">{label}</td>
                      <td className={`py-1.5 text-right font-mono ${sentimentColor(sentiment)}`}>
                        {formatKPIValue(key, type, kpis)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
