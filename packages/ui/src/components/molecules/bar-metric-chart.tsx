"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

export interface BarMetricDataPoint {
  name: string;
  value: number;
}

export interface BarMetricChartProps {
  /** Card title shown above the chart */
  title: string;
  /** Chart data array */
  data: BarMetricDataPoint[];
  /** Primary formatted value shown in the CardTitle */
  value?: string;
  /** Optional subtitle / description */
  description?: string;
  /** Key from data to use as the bar value. Defaults to `"value"`. */
  dataKey?: string;
  /** Height of the chart area in pixels. Defaults to 200. */
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

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function BarMetricChart({
  title,
  data,
  value,
  description,
  dataKey = "value",
  chartHeight = 200,
  formatYTick = defaultFormatYTick,
  formatTooltip = (v) => v.toLocaleString(),
  className,
}: BarMetricChartProps) {
  const chartConfig: ChartConfig = {
    [dataKey]: { label: title, color: "hsl(var(--primary))" },
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
          <BarChart
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
            <Bar dataKey={dataKey} radius={4} maxBarSize={48}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
