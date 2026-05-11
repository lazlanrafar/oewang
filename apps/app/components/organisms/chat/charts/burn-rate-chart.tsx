"use client";

import { Area, Line, Tooltip, XAxis, YAxis } from "recharts";

import type { BurnRateChartProps } from "@workspace/types";
import { BaseChart, StyledTooltip } from "./base-charts";
import { commonChartConfig, createCompactTickFormatter, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";
import { SelectableChartWrapper } from "./selectable-chart-wrapper";

export function BurnRateChart({
  data,
  height = 320,
  currency = "USD",
  locale,
  enableSelection = false,
  onSelectionChange,
  onSelectionComplete,
  onSelectionStateChange,
}: BurnRateChartProps) {
  // Use the compact tick formatter
  const tickFormatter = createCompactTickFormatter();

  // Calculate margin using the utility hook
  const { marginLeft } = useChartMargin(data, "amount", tickFormatter);

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
          dataKey="amount"
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
                const displayName = name === "amount" ? "Current" : "Average";
                return [formattedValue, displayName];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="var(--chart-actual-line)"
          strokeWidth={2}
          fill="url(#expensePattern)"
          dot={{
            fill: "var(--chart-actual-line)",
            strokeWidth: 0,
            r: 3,
          }}
          activeDot={{
            r: 5,
            fill: "var(--chart-actual-line)",
            stroke: "var(--chart-actual-line)",
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="average"
          stroke="var(--chart-axis-text)"
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
        onSelectionComplete?.(startDate, endDate, "burn-rate");
      }}
      onSelectionStateChange={onSelectionStateChange}
      chartType="burn-rate"
    >
      {chartContent}
    </SelectableChartWrapper>
  );
}
