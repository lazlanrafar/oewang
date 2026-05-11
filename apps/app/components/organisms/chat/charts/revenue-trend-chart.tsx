"use client";

import { Bar, Line, Tooltip, XAxis, YAxis } from "recharts";

import { BaseChart, StyledTooltip } from "./base-charts";
import { commonChartConfig, createCompactTickFormatter, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";
import { SelectableChartWrapper } from "./selectable-chart-wrapper";

import type { RevenueTrendChartProps } from "@workspace/types";

export function RevenueTrendChart({
  data,
  height = 320,
  currency = "USD",
  locale,
  enableSelection = false,
  onSelectionChange,
  onSelectionComplete,
}: RevenueTrendChartProps) {
  // Use the compact tick formatter
  const tickFormatter = createCompactTickFormatter();

  // Calculate margin using the utility hook
  const { marginLeft } = useChartMargin(data, "revenue", tickFormatter);

  const chartContent = (
    <div className="w-full">
      {/* Chart */}
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
          dataKey="revenue"
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
                const displayName = name === "revenue" ? "This Year" : name === "lastYearRevenue" ? "Last Year" : "Average";
                return [formattedValue, displayName];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />
        {/* This Year bars (hatched) */}
        <Bar dataKey="revenue" fill="url(#incomePattern)" isAnimationActive={false} />
        {/* Last Year bars */}
        <Bar dataKey="lastYearRevenue" fill="var(--chart-bar-fill-secondary)" isAnimationActive={false} />
        {/* Average line */}
        <Line
          type="monotone"
          dataKey="average"
          stroke="var(--chart-line-secondary)"
          strokeWidth={1}
          strokeDasharray="5 5"
          dot={false}
          isAnimationActive={false}
        />
      </BaseChart>
    </div>
  );

  return (
    <SelectableChartWrapper
      data={data}
      dateKey="month"
      enableSelection={enableSelection}
      onSelectionChange={onSelectionChange}
      onSelectionComplete={(startDate, endDate) => {
        onSelectionComplete?.(startDate, endDate, "revenue-trend");
      }}
      chartType="revenue-trend"
    >
      {chartContent}
    </SelectableChartWrapper>
  );
}
