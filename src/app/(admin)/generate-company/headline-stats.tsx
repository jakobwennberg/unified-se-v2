import { Card, CardContent } from '@/components/ui/card';

interface KPIs {
  [key: string]: number | null | boolean;
}

function formatCompactSEK(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M SEK`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K SEK`;
  return `${sign}${abs.toFixed(0)} SEK`;
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}%`;
}

function formatRatio(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

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
  kpis: KPIs;
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
              <Card key={stat.key}>
                <CardContent className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-lg font-semibold font-mono tabular-nums">
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
