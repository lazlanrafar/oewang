"use client";

import { Area, Line, Tooltip, XAxis, YAxis } from "recharts";

import type { RevenueChartProps } from "@workspace/types";
import { BaseChart, ChartLegend, StyledTooltip } from "./base-charts";
import { createYAxisTickFormatter, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";

export function RevenueChart({
  data,
  height = 320,
  className = "",
  showTarget = true,
  showLegend = true,
  currency = "USD",
  locale,
  primaryLabel = "Revenue",
  secondaryLabel = "Target",
  title = "Revenue",
}: RevenueChartProps) {
  const tickFormatter = createYAxisTickFormatter(currency, locale);
  const maxValues = data.map((d) => ({
    maxValue: Math.max(d.revenue, d.target ?? 0),
  }));
  const { marginLeft } = useChartMargin(maxValues, "maxValue", tickFormatter);

  return (
    <div className={`w-full ${className}`}>
      {/* Legend */}
      {showLegend && (
        <ChartLegend
          title={title}
          items={[
            { label: primaryLabel, type: "solid" },
            ...(showTarget ? [{ label: secondaryLabel, type: "dashed" as const }] : []),
          ]}
        />
      )}

      {/* Chart */}
      <BaseChart data={data} height={height} margin={{ top: 6, right: 6, left: -marginLeft, bottom: 6 }}>
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--chart-axis-text)", fontSize: 10 }}
        />
        <YAxis
          tickFormatter={tickFormatter}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--chart-axis-text)", fontSize: 10 }}
        />

        <Tooltip
          content={
            <StyledTooltip
              formatter={(value: number | string, name: string) => {
                const numValue = typeof value === "number" ? value : Number(value);
                const formattedValue =
                  formatAmount({
                    amount: numValue,
                    currency,
                    locale,
                    maximumFractionDigits: 0,
                  }) || `${currency}${numValue.toLocaleString()}`;
                const displayName = name === "revenue" ? primaryLabel : secondaryLabel;
                return [formattedValue, displayName];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />

        <Area
          dataKey="revenue"
          type="monotone"
          stroke="var(--chart-actual-line)"
          fill="url(#incomePattern)"
          strokeWidth={2}
          isAnimationActive={false}
        />

        {showTarget && (
          <Line
            dataKey="target"
            type="monotone"
            stroke="var(--chart-line-secondary)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            strokeDasharray="5 5"
          />
        )}
      </BaseChart>
    </div>
  );
}
