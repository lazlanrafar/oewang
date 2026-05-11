"use client";

import { format, parseISO } from "date-fns";
import { Bar, Line, Tooltip, XAxis, YAxis } from "recharts";

import type { StackedBarChartProps } from "@workspace/types";
import { BaseChart, StyledTooltip } from "./base-charts";
import { commonChartConfig, createCompactTickFormatter, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";
import { SelectableChartWrapper } from "./selectable-chart-wrapper";

export function StackedBarChart({
  data,
  height = 290,
  locale,
  enableSelection = false,
  onSelectionChange,
  onSelectionComplete,
  onSelectionStateChange,
}: StackedBarChartProps) {
  const tickFormatter = createCompactTickFormatter();

  const formattedData = (data?.result || []).map((item) => ({
    ...item,
    value: item.value,
    recurring: item.recurring,
    total: item.total,
    meta: data?.meta,
    date: format(parseISO(item.date), "MMM"),
  }));

  // Calculate margin using the utility hook
  const { marginLeft } = useChartMargin(formattedData, "total", tickFormatter);

  const chartContent = (
    <div className="relative w-full">
      {/* Chart */}
      <BaseChart data={formattedData} height={height} margin={{ top: 6, right: 6, left: -marginLeft, bottom: 6 }}>
        <XAxis
          dataKey="date"
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
          dataKey="total"
        />

        <Tooltip
          content={
            <StyledTooltip
              formatter={(value: number | string, name: string, entry: any) => {
                const current = entry.payload;
                const numValue = typeof value === "number" ? value : Number(value);
                const currency = current?.currency || "USD";
                const formattedValue =
                  formatAmount({
                    amount: numValue,
                    currency,
                    locale,
                    maximumFractionDigits: 0,
                  }) ?? `${currency}${numValue.toLocaleString()}`;

                const displayName = name.charAt(0).toUpperCase() + name.slice(1);
                return [formattedValue, displayName];
              }}
            />
          }
          cursor={false}
        />

        <Bar barSize={16} dataKey="recurring" stackId="a" fill="url(#incomePattern)" isAnimationActive={false} />

        <Bar barSize={16} dataKey="value" stackId="a" fill="var(--chart-bar-fill-secondary)" isAnimationActive={false} />

        <Line
          type="monotone"
          dataKey="recurring"
          strokeWidth={2.5}
          stroke="hsl(var(--primary))"
          dot={false}
          isAnimationActive={false}
        />
      </BaseChart>
    </div>
  );

  return (
    <SelectableChartWrapper
      data={formattedData}
      dateKey="date"
      enableSelection={enableSelection}
      onSelectionChange={onSelectionChange}
      onSelectionComplete={(startDate, endDate) => {
        onSelectionComplete?.(startDate, endDate, "stacked-bar");
      }}
      onSelectionStateChange={onSelectionStateChange}
      chartType="stacked-bar"
    >
      {chartContent}
    </SelectableChartWrapper>
  );
}
