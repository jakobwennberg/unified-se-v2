'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '@/lib/charts/theme';
import type { KPIValues } from '@/components/shared/kpi-display';
import { formatCompactSEK } from '@/components/shared/kpi-display';

interface CapitalDonutProps {
  kpis: KPIValues;
}

interface SliceItem {
  name: string;
  value: number;
  color: string;
}

interface TooltipPayloadItem {
  payload: SliceItem;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
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
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: item.color }}
        />
        <span className="font-medium">{item.name}</span>
      </div>
      <p style={{ color: CHART_COLORS.tooltipMuted }}>
        {formatCompactSEK(item.value)}
      </p>
    </div>
  );
}

export function CapitalDonut({ kpis }: CapitalDonutProps) {
  const num = (key: string): number => {
    const v = kpis[key];
    return typeof v === 'number' ? v : 0;
  };

  const totalAssets = num('totalAssets');
  const equity = Math.max(0, num('adjustedEquity'));
  const interestBearingDebt = Math.max(0, num('interestBearingDebt'));
  const totalLiabilities = Math.max(0, num('totalLiabilities'));
  const otherLiabilities = Math.max(0, totalLiabilities - interestBearingDebt);

  if (totalAssets <= 0) {
    return (
      <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
        No capital structure data available
      </div>
    );
  }

  const equityRatio = kpis['equityRatio'];
  const equityRatioStr =
    typeof equityRatio === 'number' ? `${equityRatio.toFixed(1)}%` : '—';

  const data: SliceItem[] = [
    { name: 'Equity', value: equity, color: CHART_COLORS.capital.equity },
    {
      name: 'Interest-Bearing Debt',
      value: interestBearingDebt,
      color: CHART_COLORS.capital.interestBearingDebt,
    },
    {
      name: 'Other Liabilities',
      value: otherLiabilities,
      color: CHART_COLORS.capital.otherLiabilities,
    },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
        No capital structure data available
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={95}
            dataKey="value"
            strokeWidth={2}
            stroke="#111827"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">Equity Ratio</span>
        <span className="text-lg font-semibold font-mono tabular-nums">
          {equityRatioStr}
        </span>
      </div>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
