"use client";

import { Bar, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import type { CashFlowChartProps } from "@workspace/types";
import { BaseChart, ChartLegend, StyledTooltip } from "./base-charts";
import { commonChartConfig, createYAxisTickFormatter, getZeroInclusiveDomain, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";

export function CashFlowChart({
  data,
  height = 320,
  className = "",
  showCumulative = true,
  showLegend = true,
  currency = "USD",
  locale,
}: CashFlowChartProps) {
  const tickFormatter = createYAxisTickFormatter(currency, locale);
  // Calculate margin based on the maximum value across all data points
  const maxValues = data.map((d) => ({
    maxValue: Math.max(Math.abs(d.inflow), Math.abs(d.outflow), Math.abs(d.netFlow), Math.abs(d.cumulativeFlow)),
  }));
  const { marginLeft } = useChartMargin(maxValues, "maxValue", tickFormatter);

  return (
    <div className={`w-full ${className}`}>
      {/* Legend */}
      {showLegend && (
        <ChartLegend
          title="Cash Flow Analysis"
          items={[
            { label: "Inflow", type: "solid" },
            { label: "Outflow", type: "pattern" },
            { label: "Net Flow", type: "solid" },
            ...(showCumulative ? [{ label: "Cumulative", type: "dashed" as const }] : []),
          ]}
        />
      )}

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
                const numValue = typeof value === "number" ? value : Number(value);
                const formattedValue =
                  formatAmount({
                    amount: numValue,
                    currency,
                    locale: locale ?? undefined,
                    maximumFractionDigits: 0,
                  }) || `${currency}${numValue.toLocaleString()}`;
                const displayName =
                  name === "inflow"
                    ? "Cash Inflow"
                    : name === "outflow"
                      ? "Cash Outflow"
                      : name === "netFlow"
                        ? "Net Flow"
                        : "Cumulative Flow";
                return [formattedValue, displayName];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />

        {/* Income bars */}
        <Bar dataKey="inflow" fill="var(--chart-bar-fill)" isAnimationActive={false} />
        {/* Expenses bars with pattern */}
        <Bar dataKey="outflow" fill="url(#outflowPattern)" isAnimationActive={false} />
        {/* Net flow bars */}
        <Bar dataKey="netFlow" fill="var(--chart-actual-line)" isAnimationActive={false} />

        {showCumulative && (
          <Line
            type="monotone"
            dataKey="cumulativeFlow"
            stroke="var(--chart-line-secondary)"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive={false}
          />
        )}

        {/* Reference line at zero */}
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="2 2" />
      </BaseChart>
    </div>
  );
}
