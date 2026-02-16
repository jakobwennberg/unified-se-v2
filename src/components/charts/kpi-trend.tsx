'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { CHART_COLORS } from '@/lib/charts/theme';
import type { MonthlyKPIEntry } from '@/lib/sie/types';
import {
  formatCompactSEK,
  formatPct,
  formatRatio,
} from '@/components/shared/kpi-display';

export type MetricFormat = 'sek' | 'pct' | 'ratio';

export interface TrendMetric {
  key: string;
  label: string;
  color?: string;
  format?: MetricFormat;
}

interface KPITrendProps {
  series: MonthlyKPIEntry[];
  metrics: TrendMetric[];
  height?: number;
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatMonth(ym: string): string {
  const parts = ym.split('-');
  if (parts.length < 2) return ym;
  const monthIdx = parseInt(parts[1]!, 10) - 1;
  return MONTH_LABELS[monthIdx] ?? ym;
}

function formatValue(value: number | null, format?: MetricFormat): string {
  if (value == null) return '—';
  switch (format) {
    case 'sek': return formatCompactSEK(value);
    case 'pct': return formatPct(value);
    case 'ratio': return formatRatio(value);
    default: return value.toLocaleString('sv-SE', { maximumFractionDigits: 1 });
  }
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number | null;
  color: string;
  name: string;
}

function CustomTooltip({
  active,
  payload,
  label,
  metrics,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  metrics: TrendMetric[];
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-lg"
      style={{
        backgroundColor: CHART_COLORS.tooltipBg,
        borderColor: CHART_COLORS.tooltipBorder,
        color: CHART_COLORS.tooltipText,
      }}
    >
      <p className="mb-1 font-medium" style={{ color: CHART_COLORS.tooltipMuted }}>
        {label}
      </p>
      {payload.map((item) => {
        const metric = metrics.find((m) => m.key === item.dataKey);
        return (
          <div key={item.dataKey} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span>{metric?.label ?? item.name}:</span>
            <span className="font-mono font-semibold">
              {formatValue(item.value, metric?.format)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function KPITrend({ series, metrics, height = 280 }: KPITrendProps) {
  if (series.length === 0 || metrics.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No monthly data available
      </div>
    );
  }

  // Transform series into chart data
  const data = series.map((entry) => {
    const row: Record<string, string | number | null> = {
      month: formatMonth(entry.month),
    };
    for (const m of metrics) {
      const val = entry.kpis[m.key as keyof typeof entry.kpis];
      row[m.key] = typeof val === 'number' ? val : null;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v: number) => {
            // Auto-format based on the first metric's format
            const fmt = metrics[0]?.format;
            if (fmt === 'pct') return `${v.toFixed(0)}%`;
            if (fmt === 'sek') return formatCompactSEK(v);
            return v.toLocaleString('sv-SE', { maximumFractionDigits: 1 });
          }}
        />
        <Tooltip
          content={<CustomTooltip metrics={metrics} />}
          cursor={{ stroke: CHART_COLORS.grid }}
        />
        {metrics.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, color: CHART_COLORS.axis }}
          />
        )}
        {metrics.map((m, i) => (
          <Line
            key={m.key}
            type="monotone"
            dataKey={m.key}
            name={m.label}
            stroke={m.color ?? CHART_COLORS.category[i % CHART_COLORS.category.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
