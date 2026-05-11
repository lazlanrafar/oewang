"use client";

import { Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import type { ProjectedCashBalanceData, StressTestChartProps } from "@workspace/types";
import { BaseChart, StyledTooltip } from "./base-charts";
import { commonChartConfig, createCompactTickFormatter, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";

// Cash Balance Projection Line Chart
export function CashBalanceProjectionChart({
  data,
  height = 320,
  currency = "USD",
  locale,
}: {
  data: ProjectedCashBalanceData[];
  height?: number;
  currency?: string;
  locale?: string;
}) {
  const tickFormatter = createCompactTickFormatter();
  // Calculate margin based on the maximum value across all scenarios
  const maxValues = data.map((d) => ({
    maxValue: Math.max(d.baseCase, d.worstCase, d.bestCase),
  }));
  const { marginLeft } = useChartMargin(maxValues, "maxValue", tickFormatter);

  return (
    <div className="w-full">
      <BaseChart data={data} height={height} margin={{ top: 6, right: 6, left: -marginLeft, bottom: 6 }}>
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{
            fill: "var(--chart-axis-text)",
            fontSize: 10,
            fontFamily: commonChartConfig.fontFamily,
          }}
          label={{
            value: "Months from now",
            position: "insideBottom",
            offset: -10,
            style: {
              textAnchor: "middle",
              fill: "var(--chart-axis-text)",
              fontSize: 10,
              fontFamily: commonChartConfig.fontFamily,
            },
          }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{
            fill: "var(--chart-axis-text)",
            fontSize: 10,
            fontFamily: commonChartConfig.fontFamily,
          }}
          tickFormatter={tickFormatter}
        />
        <Tooltip
          content={
            <StyledTooltip
              formatter={(value: number | string, name: string) => {
                const formattedValue = formatAmount({
                  amount: typeof value === "number" ? value : Number(value),
                  currency,
                  locale: locale ?? undefined,
                  maximumFractionDigits: 0,
                }) ?? `${currency}${value.toLocaleString()}`;
                const displayName = name === "baseCase" ? "Base Case" : name === "worstCase" ? "Worst Case" : "Best Case";
                return [formattedValue, displayName];
              }}
              labelFormatter={(label) => `Month ${label}`}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />
        {/* Base Case Line */}
        <Line
          type="monotone"
          dataKey="baseCase"
          stroke="hsl(var(--primary))"
          strokeWidth={1}
          dot={false}
          name="baseCase"
          isAnimationActive={false}
        />
        {/* Worst Case Line */}
        <Line
          type="monotone"
          dataKey="worstCase"
          stroke="var(--chart-line-secondary)"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          name="worstCase"
          isAnimationActive={false}
        />
        {/* Best Case Line */}
        <Line
          type="monotone"
          dataKey="bestCase"
          stroke="var(--chart-line-secondary)"
          strokeWidth={2}
          strokeDasharray="3 3"
          dot={false}
          name="bestCase"
          isAnimationActive={false}
        />
        {/* Reference line at zero */}
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="2 2" />
      </BaseChart>
    </div>
  );
}

// Combined Stress Test Chart Component
export function StressTestChart({
  projectedCashBalance,
  height = 320,
  currency = "USD",
  locale,
}: StressTestChartProps) {
  return <CashBalanceProjectionChart data={projectedCashBalance} height={height} currency={currency} locale={locale} />;
}
