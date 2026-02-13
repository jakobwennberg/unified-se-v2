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
} from 'recharts';
import { CHART_COLORS } from '@/lib/charts/theme';
import type { KPIValues } from '@/components/shared/kpi-display';

interface MarginBarsProps {
  kpis: KPIValues;
}

interface MarginItem {
  name: string;
  value: number;
}

interface TooltipPayloadItem {
  payload: MarginItem;
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
      <p style={{ color: item.value >= 0 ? CHART_COLORS.green : CHART_COLORS.red }}>
        {item.value.toFixed(1)}%
      </p>
    </div>
  );
}

export function MarginBars({ kpis }: MarginBarsProps) {
  const margins: { key: string; label: string }[] = [
    { key: 'grossMargin', label: 'Gross' },
    { key: 'ebitdaMargin', label: 'EBITDA' },
    { key: 'operatingMargin', label: 'Operating' },
    { key: 'profitMargin', label: 'Profit' },
    { key: 'netMargin', label: 'Net' },
  ];

  const data: MarginItem[] = margins
    .filter((m) => {
      const v = kpis[m.key];
      return typeof v === 'number' && v !== null;
    })
    .map((m) => ({
      name: m.label,
      value: kpis[m.key] as number,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No margin data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
      >
        <XAxis
          type="number"
          tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: CHART_COLORS.axis, fontSize: 12, fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} cursor={false} />
        <ReferenceLine x={0} stroke={CHART_COLORS.grid} />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={20}>
          {data.map((item, i) => (
            <Cell
              key={i}
              fill={item.value >= 0 ? CHART_COLORS.gold : CHART_COLORS.red}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
