"use client";

import { Bar, Line, Tooltip, XAxis, YAxis } from "recharts";

import type { ProfitChartProps } from "@workspace/types";
import { BaseChart, StyledTooltip } from "./base-charts";
import { commonChartConfig, createCompactTickFormatter, getZeroInclusiveDomain, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";
import { SelectableChartWrapper } from "./selectable-chart-wrapper";

export function ProfitChart({
  data,
  height = 320,
  currency = "USD",
  locale,
  enableSelection = false,
  onSelectionChange,
  onSelectionComplete,
  onSelectionStateChange,
}: ProfitChartProps) {
  // Use the compact tick formatter
  const tickFormatter = createCompactTickFormatter();

  // Calculate margin using the utility hook
  const { marginLeft } = useChartMargin(data, "profit", tickFormatter);

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
          domain={getZeroInclusiveDomain()}
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
                const displayName = name === "profit" ? "This Year" : name === "lastYearProfit" ? "Last Year" : "Average";
                return [formattedValue, displayName];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />
        {/* Last Year bars */}
        <Bar dataKey="lastYearProfit" fill="var(--chart-bar-fill-secondary)" isAnimationActive={false} />
        {/* This Year bars */}
        <Bar dataKey="profit" fill="var(--chart-bar-fill)" isAnimationActive={false} />
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
        onSelectionComplete?.(startDate, endDate, "profit");
      }}
      onSelectionStateChange={onSelectionStateChange}
      chartType="profit"
    >
      {chartContent}
    </SelectableChartWrapper>
  );
}
