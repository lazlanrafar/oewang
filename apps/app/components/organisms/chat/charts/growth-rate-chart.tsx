"use client";

import { Bar, Line, Tooltip, XAxis, YAxis } from "recharts";

import type { GrowthRateChartProps } from "@workspace/types";
import { BaseChart, StyledTooltip } from "./base-charts";
import { commonChartConfig, createCompactTickFormatter, getZeroInclusiveDomain, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";

export function GrowthRateChart({ data, height = 320, currency = "USD", locale }: GrowthRateChartProps) {
  // Use the compact tick formatter
  const tickFormatter = createCompactTickFormatter();

  // Calculate margin using the utility hook
  const { marginLeft } = useChartMargin(data, "currentTotal", tickFormatter);

  return (
    <div className="w-full">
      {/* Chart */}
      <BaseChart data={data} height={height} margin={{ top: 6, right: 6, left: -marginLeft, bottom: 6 }}>
        <XAxis
          dataKey="period"
          axisLine={false}
          tickLine={false}
          tick={{
            fill: "var(--chart-axis-text)",
            fontSize: 10,
            fontFamily: commonChartConfig.fontFamily,
          }}
        />
        <YAxis
          yAxisId="left"
          axisLine={false}
          tickLine={false}
          tick={{
            fill: "var(--chart-axis-text)",
            fontSize: 10,
            fontFamily: commonChartConfig.fontFamily,
          }}
          tickFormatter={tickFormatter}
          dataKey="currentTotal"
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          axisLine={false}
          tickLine={false}
          tick={{
            fill: "var(--chart-axis-text)",
            fontSize: 10,
            fontFamily: commonChartConfig.fontFamily,
          }}
          tickFormatter={(value) => `${value > 0 ? "+" : ""}${value.toFixed(0)}%`}
          domain={getZeroInclusiveDomain()}
        />
        <Tooltip
          content={
            <StyledTooltip
              formatter={(value: number | string, name: string) => {
                const numericValue = typeof value === "number" ? value : Number(value);
                if (name === "growthRate") {
                  return [`${numericValue > 0 ? "+" : ""}${numericValue.toFixed(1)}%`, "Growth Rate"];
                }
                const formattedValue = formatAmount({
                  amount: numericValue,
                  currency,
                  locale: locale ?? undefined,
                  maximumFractionDigits: 0,
                }) ?? `${currency}${numericValue.toLocaleString()}`;
                const displayName = name === "currentTotal" ? "Current" : "Previous";
                return [formattedValue, displayName];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />
        {/* Previous period bars (with opacity) */}
        <Bar
          yAxisId="left"
          dataKey="previousTotal"
          fill="var(--chart-bar-fill-secondary)"
          isAnimationActive={false}
        />
        {/* Current period bars (hatched) */}
        <Bar yAxisId="left" dataKey="currentTotal" fill="url(#incomePattern)" isAnimationActive={false} />
        {/* Growth rate line */}
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="growthRate"
          stroke="var(--chart-line-secondary)"
          strokeWidth={2}
          dot={{ fill: "var(--chart-line-secondary)", r: 3 }}
          isAnimationActive={false}
        />
      </BaseChart>
    </div>
  );
}
