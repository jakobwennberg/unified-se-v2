'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CHART_COLORS } from '@/lib/charts/theme';
import type { KPIValues } from '@/components/shared/kpi-display';
import { formatCompactSEK } from '@/components/shared/kpi-display';

interface BalanceCompositionProps {
  kpis: KPIValues;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
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
      <p className="mb-1 font-medium">{label}</p>
      {payload
        .filter((p) => p.value > 0)
        .map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span style={{ color: CHART_COLORS.tooltipMuted }}>{p.name}:</span>
            <span>{formatCompactSEK(p.value)}</span>
          </div>
        ))}
    </div>
  );
}

export function BalanceComposition({ kpis }: BalanceCompositionProps) {
  const num = (key: string): number => {
    const v = kpis[key];
    return typeof v === 'number' && v > 0 ? v : 0;
  };

  const totalAssets = num('totalAssets');
  if (totalAssets === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No balance sheet data available
      </div>
    );
  }

  const fixedAssets = num('fixedAssets');
  const inventory = num('inventory');
  const customerReceivables = num('customerReceivables');
  const cash = num('cashAndBank');
  const currentAssets = num('currentAssets');
  const otherCurrent = Math.max(0, currentAssets - inventory - customerReceivables - cash);

  const equity = num('adjustedEquity');
  const longTermLiabilities = num('longTermLiabilities');
  const currentLiabilities = num('currentLiabilities');

  const data = [
    {
      name: 'Assets',
      'Fixed Assets': fixedAssets,
      Inventory: inventory,
      Receivables: customerReceivables,
      Cash: cash,
      'Other Current': otherCurrent,
    },
    {
      name: 'Financing',
      Equity: equity,
      'Long-Term Liab.': longTermLiabilities,
      'Current Liab.': currentLiabilities,
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
      >
        <XAxis
          type="number"
          tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatCompactSEK(v)}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: CHART_COLORS.axis, fontSize: 12, fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          width={75}
        />
        <Tooltip content={<CustomTooltip />} cursor={false} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: CHART_COLORS.axis }}
          iconSize={8}
          iconType="circle"
        />
        {/* Asset segments */}
        <Bar dataKey="Fixed Assets" stackId="stack" fill={CHART_COLORS.assets.fixedAssets} radius={0} />
        <Bar dataKey="Inventory" stackId="stack" fill={CHART_COLORS.assets.inventory} radius={0} />
        <Bar dataKey="Receivables" stackId="stack" fill={CHART_COLORS.assets.receivables} radius={0} />
        <Bar dataKey="Cash" stackId="stack" fill={CHART_COLORS.assets.cash} radius={0} />
        <Bar dataKey="Other Current" stackId="stack" fill={CHART_COLORS.assets.otherCurrent} radius={0} />
        {/* Financing segments */}
        <Bar dataKey="Equity" stackId="stack" fill={CHART_COLORS.financing.equity} radius={0} />
        <Bar dataKey="Long-Term Liab." stackId="stack" fill={CHART_COLORS.financing.longTermLiabilities} radius={0} />
        <Bar dataKey="Current Liab." stackId="stack" fill={CHART_COLORS.financing.currentLiabilities} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
