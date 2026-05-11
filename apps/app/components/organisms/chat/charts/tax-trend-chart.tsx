"use client";

import { Bar, Tooltip, XAxis, YAxis } from "recharts";

import type { TaxTrendChartProps } from "@workspace/types";
import { BaseChart, StyledTooltip } from "./base-charts";
import { commonChartConfig, createCompactTickFormatter, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";

export function TaxTrendChart({ data, height = 320, currency = "USD", locale }: TaxTrendChartProps) {
  // Use the compact tick formatter
  const tickFormatter = createCompactTickFormatter();

  // Calculate margin using the utility hook
  const { marginLeft } = useChartMargin(data, "taxAmount", tickFormatter);

  return (
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
          dataKey="taxAmount"
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
                const displayName = name === "taxAmount" ? "Tax" : "Taxable Income";
                return [formattedValue, displayName];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />
        {/* Tax amount bars (hatched) */}
        <Bar dataKey="taxAmount" fill="url(#expensePattern)" isAnimationActive={false} />
      </BaseChart>
    </div>
  );
}
