"use client";

import { Bar, Line, Tooltip, XAxis, YAxis } from "recharts";

import type { InvoicePaymentChartProps } from "@workspace/types";
import { BaseChart, StyledTooltip } from "./base-charts";
import { commonChartConfig, createCompactTickFormatter, useChartMargin } from "./chart-utils";

export function InvoicePaymentChart({ data, height = 320, locale }: InvoicePaymentChartProps) {
  // Use the compact tick formatter
  const tickFormatter = createCompactTickFormatter();

  // Calculate margin using the utility hook
  const { marginLeft } = useChartMargin(data, "averageDaysToPay", tickFormatter);

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
          yAxisId="left"
          axisLine={false}
          tickLine={false}
          tick={{
            fill: "var(--chart-axis-text)",
            fontSize: 10,
            fontFamily: commonChartConfig.fontFamily,
          }}
          tickFormatter={(value) => `${value.toFixed(0)}`}
          dataKey="averageDaysToPay"
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
          tickFormatter={(value) => `${value.toFixed(0)}%`}
          dataKey="paymentRate"
        />
        <Tooltip
          content={
            <StyledTooltip
              formatter={(value: number | string, name: string) => {
                const numericValue = typeof value === "number" ? value : Number(value);
                if (name === "averageDaysToPay") {
                  return [`${numericValue.toFixed(1)} days`, "Avg Days to Pay"];
                }
                if (name === "paymentRate") {
                  return [`${numericValue.toFixed(1)}%`, "Payment Rate"];
                }
                return [String(value), name];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />
        {/* Average Days to Pay bars */}
        <Bar yAxisId="left" dataKey="averageDaysToPay" fill="url(#incomePattern)" isAnimationActive={false} />
        {/* Payment Rate line */}
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="paymentRate"
          stroke="var(--chart-line-secondary)"
          strokeWidth={2}
          dot={{ fill: "var(--chart-line-secondary)", r: 3 }}
          isAnimationActive={false}
        />
      </BaseChart>
    </div>
  );
}
