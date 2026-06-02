"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "../../lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../atoms/card";
import type { ChartConfig } from "../atoms/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../atoms/chart";

export interface LineMetricDataPoint {
  name: string;
  current?: number;
  average?: number;
}

export interface LineMetricChartProps {
  /** Card title shown above the chart */
  title: string;
  /** Chart data array */
  data: LineMetricDataPoint[];
  /** Primary formatted value shown in the CardTitle (e.g. the latest period value) */
  value?: string;
  /** Optional subtitle / description */
  description?: string;
  /** Key from data to use as the "current" line. Defaults to `"current"`. */
  currentKey?: string;
  /** Key from data to use as the "average" dashed line. Defaults to `"average"`. */
  averageKey?: string;
  /** Color for the primary (current) line. Any valid CSS color or CSS variable. */
  currentColor?: string;
  /** Color for the secondary (average) dashed line. */
  averageColor?: string;
  /** Height of the chart area in pixels. Defaults to 140. */
  chartHeight?: number;
  /** Format function for Y-axis tick labels. Defaults to compact number format. */
  formatYTick?: (value: number) => string;
  /** Format function for tooltip values. Defaults to toLocaleString. */
  formatTooltip?: (value: number) => string;
  className?: string;
}

function defaultFormatYTick(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return `${value}`;
}

/**
 * ## LineMetricChart
 *
 * A reusable metric line chart card that displays current vs average trends
 * over time. Part of the design system's **Molecules** tier.
 *
 * ### Example
 * ```tsx
 * <LineMetricChart
 *   title="Revenue"
 *   value={formatCurrency(latest, settings)}
 *   data={revenueData}
 *   formatTooltip={(v) => formatCurrency(v, settings)}
 * />
 * ```
 */
export function LineMetricChart({
  title,
  data,
  value,
  description,
  currentKey = "current",
  averageKey = "average",
  currentColor = "var(--primary)",
  averageColor = "var(--muted-foreground)",
  chartHeight = 140,
  formatYTick = defaultFormatYTick,
  formatTooltip = (v) => v.toLocaleString(),
  className,
}: LineMetricChartProps) {
  const chartConfig: ChartConfig = {
    [currentKey]: { label: "Current", color: currentColor },
    [averageKey]: { label: "Average", color: averageColor },
  };

  return (
    <Card
      className={cn(
        "flex flex-col bg-background border-border overflow-hidden",
        className,
      )}
    >
      <CardHeader className="items-start pb-0 pt-4 px-4">
        {description && (
          <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {description}
          </CardDescription>
        )}
        {value !== undefined ? (
          <CardTitle className="text-2xl font-semibold tracking-tight mt-0.5">
            {value}
          </CardTitle>
        ) : (
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
        )}
        {value !== undefined && (
          <p className="text-xs text-muted-foreground mt-0.5">{title}</p>
        )}
      </CardHeader>
      <CardContent className="pb-3 px-2 pt-2">
        <ChartContainer
          config={chartConfig}
          className="w-full"
          style={{ height: chartHeight }}
        >
          <LineChart
            accessibilityLayer
            data={data}
            margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={36}
              tickCount={4}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={formatYTick}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  className="text-xs"
                  formatter={(val) => formatTooltip(Number(val))}
                />
              }
            />
            <Line
              type="monotone"
              dataKey={averageKey}
              stroke={`var(--color-${averageKey})`}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey={currentKey}
              stroke={`var(--color-${currentKey})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
