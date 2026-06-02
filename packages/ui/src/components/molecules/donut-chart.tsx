"use client";

import { TrendingUp } from "lucide-react";
import * as React from "react";
import { Pie, PieChart } from "recharts";
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

/** Built-in color palette for pie slices. Override via `colors` prop. */
const DEFAULT_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
];

export interface DonutChartDataPoint {
  name: string;
  value: number;
}

export interface DonutChartProps {
  /** Card title */
  title: string;
  /** Card subtitle / period label */
  description?: string;
  /** Chart data */
  data: DonutChartDataPoint[];
  /** Maximum number of slices to show before grouping the rest into "Others". Defaults to 7. */
  maxSlices?: number;
  /** Label for the "everything else" group. Defaults to "Others". */
  othersLabel?: string;
  /** Color palette for slices. Cycles if there are more slices than colors. */
  colors?: string[];
  /** Format function for displayed values (tooltip + footer total). */
  formatValue?: (value: number) => string;
  /** Optional footer label above the total. Defaults to "Total". */
  footerLabel?: string;
  /** Height for the pie chart area. Defaults to 300. */
  chartHeight?: number;
  className?: string;
}

/**
 * ## DonutChart
 *
 * A reusable donut/pie chart card with automatic "Others" slicing and an
 * optional currency-formatted total footer. Part of the design system's **Molecules** tier.
 *
 * ### Example
 * ```tsx
 * <DonutChart
 *   title="Expenses by Category"
 *   description="Current Month"
 *   data={categoryData}
 *   maxSlices={7}
 *   formatValue={(v) => formatCurrency(v, settings)}
 *   footerLabel="Total Expenses"
 * />
 * ```
 */
export function DonutChart({
  title,
  description = "Current Month",
  data,
  maxSlices = 7,
  othersLabel = "Others",
  colors = DEFAULT_COLORS,
  formatValue = (v) => v.toLocaleString(),
  footerLabel = "Total",
  chartHeight = 300,
  className,
}: DonutChartProps) {
  // Group excess slices into "Others"
  const processedData = React.useMemo(() => {
    if (data.length <= maxSlices) return data;
    const top = data.slice(0, maxSlices - 1);
    const othersValue = data
      .slice(maxSlices - 1)
      .reduce((s, d) => s + d.value, 0);
    return [...top, { name: othersLabel, value: othersValue }];
  }, [data, maxSlices, othersLabel]);

  const total = processedData.reduce((s, d) => s + d.value, 0);

  const chartData = processedData.map((item, i) => ({
    ...item,
    fill: colors[i % colors.length],
  }));

  const dynamicConfig = processedData.reduce<ChartConfig>((acc, item, i) => {
    acc[item.name] = { label: item.name, color: colors[i % colors.length] };
    return acc;
  }, {});

  return (
    <Card
      className={cn(
        "flex flex-col bg-background border-border overflow-hidden h-full w-full",
        className,
      )}
    >
      <CardHeader className="items-center pb-0 pt-5 px-5">
        <CardTitle className="text-xl font-semibold tracking-tight">
          {title}
        </CardTitle>
        <CardDescription className="text-sm font-medium">
          {description}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 pb-0 px-5 pt-6 flex flex-col items-center overflow-hidden min-h-0">
        {processedData.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm pb-4">
            No data available
          </div>
        ) : (
          <ChartContainer
            config={dynamicConfig}
            className="[&_.recharts-pie-label-text]:fill-foreground mx-auto aspect-square w-full pb-0"
            style={{ maxHeight: chartHeight }}
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{name}</span>
                        <span className="font-medium text-foreground">
                          {formatValue(value as number)}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                label={({ value }) => formatValue(value)}
                innerRadius={60}
                outerRadius={100}
                strokeWidth={2}
                stroke="hsl(var(--background))"
              />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>

      <div className="mt-auto border-t border-border/40 p-5 bg-muted/20">
        <div className="flex flex-col gap-2 text-sm justify-center items-center">
          <div className="flex items-center gap-2 leading-none font-medium">
            {footerLabel}{" "}
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-muted-foreground leading-none font-medium">
            {formatValue(total)}
          </div>
        </div>
      </div>
    </Card>
  );
}
