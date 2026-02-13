'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { CHART_COLORS } from '@/lib/charts/theme';
import type { KPIValues } from '@/components/shared/kpi-display';

interface LiquidityGaugeProps {
  kpis: KPIValues;
}

interface RatioItem {
  name: string;
  value: number;
}

function getRatioColor(value: number): string {
  if (value < 1.0) return CHART_COLORS.red;
  if (value < 1.5) return CHART_COLORS.amber;
  return CHART_COLORS.green;
}

interface TooltipPayloadItem {
  payload: RatioItem;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!.payload;
  const color = getRatioColor(item.value);
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-lg"
      style={{
        backgroundColor: CHART_COLORS.tooltipBg,
        borderColor: CHART_COLORS.tooltipBorder,
        color: CHART_COLORS.tooltipText,
      }}
    >
      <p className="font-medium">{item.name}</p>
      <p style={{ color }}>{item.value.toFixed(2)}</p>
    </div>
  );
}

export function LiquidityGauge({ kpis }: LiquidityGaugeProps) {
  const ratios: { key: string; label: string }[] = [
    { key: 'cashRatio', label: 'Cash Ratio' },
    { key: 'quickRatio', label: 'Quick Ratio' },
    { key: 'currentRatio', label: 'Current Ratio' },
  ];

  const data: RatioItem[] = ratios
    .filter((r) => {
      const v = kpis[r.key];
      return typeof v === 'number';
    })
    .map((r) => ({
      name: r.label,
      value: kpis[r.key] as number,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No liquidity data available
      </div>
    );
  }

  // Determine max for x-axis
  const maxVal = Math.max(...data.map((d) => d.value), 2.0);
  const xMax = Math.ceil(maxVal * 1.2 * 10) / 10;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
      >
        {/* Threshold zones */}
        <ReferenceArea
          x1={0}
          x2={1.0}
          fill={CHART_COLORS.red}
          fillOpacity={0.06}
        />
        <ReferenceArea
          x1={1.0}
          x2={1.5}
          fill={CHART_COLORS.amber}
          fillOpacity={0.06}
        />
        <ReferenceArea
          x1={1.5}
          x2={xMax}
          fill={CHART_COLORS.green}
          fillOpacity={0.06}
        />
        <XAxis
          type="number"
          domain={[0, xMax]}
          tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: CHART_COLORS.axis, fontSize: 12, fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip content={<CustomTooltip />} cursor={false} />
        <ReferenceLine x={1.0} stroke={CHART_COLORS.red} strokeDasharray="3 3" strokeOpacity={0.5} />
        <ReferenceLine x={1.5} stroke={CHART_COLORS.amber} strokeDasharray="3 3" strokeOpacity={0.5} />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={24}>
          {data.map((item, i) => (
            <Cell key={i} fill={getRatioColor(item.value)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
