"use client";

import { Area, Line, Tooltip, XAxis, YAxis } from "recharts";

import type { RunwayChartProps } from "@workspace/types";
import { BaseChart, ChartLegend, StyledTooltip } from "./base-charts";
import {
  commonChartConfig,
  createMonthsTickFormatter,
  createYAxisTickFormatter,
  useChartMargin,
} from "./chart-utils";
import { formatAmount } from "./format-amount";
import { SelectableChartWrapper } from "./selectable-chart-wrapper";

export function RunwayChart({
  data,
  height = 320,
  className = "",
  showProjection = true,
  showLegend = true,
  currency = "USD",
  locale,
  displayMode = "months",
  enableSelection = false,
  onSelectionChange,
  onSelectionComplete,
  onSelectionStateChange,
}: RunwayChartProps) {
  const isMonthsMode = displayMode === "months";
  const tickFormatter = isMonthsMode
    ? createMonthsTickFormatter()
    : createYAxisTickFormatter(currency, locale);

  // Calculate margin using the actual data field
  const { marginLeft } = useChartMargin(
    data || [],
    isMonthsMode ? "runwayMonths" : "cashRemaining",
    tickFormatter,
  );

  // Guard against empty data
  if (!data || data.length === 0) {
    return (
      <div className={`flex h-full w-full items-center justify-center ${className}`}>
        <div className="-mt-12 text-muted-foreground text-xs">No runway data available</div>
      </div>
    );
  }

  const chartContent = (
    <div className={`w-full ${className}`}>
      {/* Legend */}
      {showLegend && (
        <ChartLegend
          items={[
            {
              label: isMonthsMode ? "Runway (months)" : "Cash Remaining",
              type: "solid" as const,
              color: "hsl(var(--foreground))",
            },
            ...(isMonthsMode
              ? []
              : [
                  { label: "Burn Rate", type: "pattern" as const },
                  ...(showProjection ? [{ label: "Projected", type: "dashed" as const }] : []),
                ]),
          ]}
        />
      )}

      {/* Chart */}
      <BaseChart data={data} height={height} margin={{ top: 6, right: 6, left: -marginLeft, bottom: 6 }}>
        {isMonthsMode && (
          <defs>
            <linearGradient id="runwayMonthsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0.05} />
            </linearGradient>
          </defs>
        )}
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
          domain={isMonthsMode ? [0, "dataMax"] : undefined}
        />

        <Tooltip
          content={
            <StyledTooltip
              formatter={(value: number | string, name: string) => {
                const numericValue = typeof value === "number" ? value : Number(value);

                if (isMonthsMode) {
                  const formattedValue = `${(Number.isFinite(numericValue) ? numericValue : 0).toFixed(1)} months`;
                  const displayName = name === "runwayMonths" ? "Runway" : name === "burnRate" ? "Burn Rate" : name;
                  return [formattedValue, displayName];
                }

                const formattedValue =
                  formatAmount({
                    amount: Number.isFinite(numericValue) ? numericValue : 0,
                    currency,
                    locale,
                    maximumFractionDigits: 0,
                  }) || `${currency}${value.toLocaleString()}`;
                const displayName =
                  name === "cashRemaining" ? "Cash Remaining" : name === "burnRate" ? "Burn Rate" : "Projected Cash";
                return [formattedValue, displayName];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />

        {isMonthsMode ? (
          <Area
            type="monotone"
            dataKey="runwayMonths"
            fill="url(#runwayMonthsGradient)"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            dot={{
              fill: "hsl(var(--foreground))",
              strokeWidth: 0,
              r: 3,
            }}
            activeDot={{
              r: 5,
              fill: "hsl(var(--foreground))",
              stroke: "hsl(var(--foreground))",
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        ) : (
          <>
            <Area
              dataKey="cashRemaining"
              type="monotone"
              stroke="var(--chart-actual-line)"
              fill="url(#chartAreaGradient)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              dataKey="burnRate"
              type="monotone"
              stroke="var(--chart-actual-line)"
              fill="url(#chartAreaPattern)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            {showProjection && (
              <Line
                dataKey="projectedCash"
                strokeDasharray="5 5"
                type="monotone"
                stroke="var(--chart-line-secondary)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </>
        )}
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
        onSelectionComplete?.(startDate, endDate, "runway");
      }}
      onSelectionStateChange={onSelectionStateChange}
      chartType="runway"
    >
      {chartContent}
    </SelectableChartWrapper>
  );
}
