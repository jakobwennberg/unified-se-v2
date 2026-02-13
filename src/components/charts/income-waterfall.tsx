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
import { formatCompactSEK } from '@/components/shared/kpi-display';

interface IncomeWaterfallProps {
  kpis: KPIValues;
}

interface WaterfallStep {
  name: string;
  base: number;
  delta: number;
  total: number;
  type: 'positive' | 'negative' | 'subtotal';
}

function buildWaterfallData(kpis: KPIValues): WaterfallStep[] {
  const num = (key: string): number => {
    const v = kpis[key];
    return typeof v === 'number' ? v : 0;
  };

  const netSales = num('netSales');
  const cogs = num('costOfGoodsSold');
  const grossProfit = num('grossProfit');
  const externalCosts = num('externalCosts');
  const personnelCosts = num('personnelCosts');
  const depreciation = num('depreciation');
  const ebitda = num('ebitda');
  const financialNet = num('financialNet');
  const tax = num('tax');
  const netIncome = num('netIncome');

  const steps: WaterfallStep[] = [];

  // Net Sales (starting point)
  steps.push({
    name: 'Net Sales',
    base: 0,
    delta: netSales,
    total: netSales,
    type: 'subtotal',
  });

  // COGS (negative from sales)
  steps.push({
    name: 'COGS',
    base: netSales + cogs, // cogs is typically negative, so base = netSales + (negative cogs) = grossProfit
    delta: -cogs, // Show absolute magnitude
    total: grossProfit,
    type: cogs <= 0 ? 'negative' : 'positive',
  });

  // Gross Profit subtotal
  steps.push({
    name: 'Gross Profit',
    base: 0,
    delta: grossProfit,
    total: grossProfit,
    type: 'subtotal',
  });

  // External Costs
  steps.push({
    name: 'Ext. Costs',
    base: grossProfit + externalCosts,
    delta: -externalCosts,
    total: grossProfit + externalCosts,
    type: externalCosts <= 0 ? 'negative' : 'positive',
  });

  // Personnel Costs
  const afterExternal = grossProfit + externalCosts;
  steps.push({
    name: 'Personnel',
    base: afterExternal + personnelCosts,
    delta: -personnelCosts,
    total: afterExternal + personnelCosts,
    type: personnelCosts <= 0 ? 'negative' : 'positive',
  });

  // Depreciation
  const afterPersonnel = afterExternal + personnelCosts;
  steps.push({
    name: 'Deprec.',
    base: afterPersonnel + depreciation,
    delta: -depreciation,
    total: afterPersonnel + depreciation,
    type: depreciation <= 0 ? 'negative' : 'positive',
  });

  // EBITDA subtotal
  steps.push({
    name: 'EBITDA',
    base: 0,
    delta: ebitda,
    total: ebitda,
    type: 'subtotal',
  });

  // Financial Net
  steps.push({
    name: 'Fin. Net',
    base: financialNet >= 0 ? ebitda : ebitda + financialNet,
    delta: Math.abs(financialNet),
    total: ebitda + financialNet,
    type: financialNet >= 0 ? 'positive' : 'negative',
  });

  // Tax
  const beforeTax = ebitda + financialNet;
  steps.push({
    name: 'Tax',
    base: beforeTax + tax, // tax is typically negative
    delta: -tax,
    total: beforeTax + tax,
    type: tax <= 0 ? 'negative' : 'positive',
  });

  // Net Income
  steps.push({
    name: 'Net Income',
    base: 0,
    delta: netIncome,
    total: netIncome,
    type: 'subtotal',
  });

  return steps;
}

function getBarColor(step: WaterfallStep): string {
  if (step.type === 'subtotal') {
    return step.delta >= 0 ? CHART_COLORS.blue : CHART_COLORS.red;
  }
  return step.type === 'negative' ? CHART_COLORS.red : CHART_COLORS.green;
}

interface TooltipPayloadItem {
  payload: WaterfallStep;
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
  const step = payload[0]!.payload;
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-lg"
      style={{
        backgroundColor: CHART_COLORS.tooltipBg,
        borderColor: CHART_COLORS.tooltipBorder,
        color: CHART_COLORS.tooltipText,
      }}
    >
      <p className="font-medium">{step.name}</p>
      <p style={{ color: CHART_COLORS.tooltipMuted }}>
        {formatCompactSEK(step.total)}
      </p>
    </div>
  );
}

export function IncomeWaterfall({ kpis }: IncomeWaterfallProps) {
  const data = buildWaterfallData(kpis);

  // Check if all values are zero
  const allZero = data.every((d) => d.delta === 0);
  if (allZero) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        No income statement data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
          axisLine={{ stroke: CHART_COLORS.grid }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatCompactSEK(v)}
          width={80}
        />
        <Tooltip content={<CustomTooltip />} cursor={false} />
        <ReferenceLine y={0} stroke={CHART_COLORS.grid} />
        {/* Invisible base bar */}
        <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
        {/* Visible delta bar */}
        <Bar dataKey="delta" stackId="waterfall" radius={[3, 3, 0, 0]}>
          {data.map((step, i) => (
            <Cell key={i} fill={getBarColor(step)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
