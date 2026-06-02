"use client";

import { COLORS } from "@workspace/constants";
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../atoms/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../atoms/chart";

export interface AiChartProps {
  code: string;
}

export function AiChart({ code }: AiChartProps) {
  try {
    const parsed = JSON.parse(code);
    const { type, data, xKey, yKeys, colors, title, description } = parsed;

    if (!data || !Array.isArray(data)) throw new Error("Invalid chart data");

    const validYKeys = yKeys || ["value"];

    // Build ChartConfig dynamically. For pie/donut, we need a color per data item.
    const chartConfig: ChartConfig = {};
    if (type === "pie" || type === "donut") {
      data.forEach((item: any, idx: number) => {
        const originalKey = item[xKey || "name"];
        const safeKey = `item_${idx}`;
        chartConfig[safeKey] = {
          label: originalKey,
          color: colors?.[idx] || COLORS[idx % COLORS.length],
        };
        // Inject the safe key into the data so Recharts can use it as a robust nameKey
        item._safeKey = safeKey;
      });
    } else {
      validYKeys.forEach((key: string, idx: number) => {
        chartConfig[key] = {
          label: key.charAt(0).toUpperCase() + key.slice(1),
          color: colors?.[idx] || COLORS[idx % COLORS.length],
        };
      });
    }

    const renderData = () => {
      if (type === "bar") {
        return (
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={xKey || "name"}
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {validYKeys.map((key: string) => (
              <Bar
                key={key}
                dataKey={key}
                fill={`var(--color-${key})`}
                radius={4}
              />
            ))}
          </BarChart>
        );
      }

      if (type === "line") {
        return (
          <LineChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={xKey || "name"}
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {validYKeys.map((key: string) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        );
      }

      if (type === "area") {
        return (
          <AreaChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={xKey || "name"}
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {validYKeys.map((key: string) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={`var(--color-${key})`}
                fill={`var(--color-${key})`}
                fillOpacity={0.2}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        );
      }

      if (type === "pie" || type === "donut") {
        const isDonut = type === "donut";
        return (
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={data}
              dataKey={validYKeys[0]}
              nameKey="_safeKey"
              innerRadius={isDonut ? 60 : 0}
              strokeWidth={2}
              stroke="hsl(var(--background))"
              label
            >
              {data.map((entry: any, index: number) => (
                <Cell
                  key={`cell-${index}`}
                  fill={`var(--color-${entry._safeKey})`}
                />
              ))}
            </Pie>
          </PieChart>
        );
      }

      return (
        <div className="flex h-full items-center justify-center text-sm text-destructive">
          Unsupported chart type: {type}
        </div>
      );
    };

    return (
      <Card className="my-4 overflow-hidden border">
        {(title || description) && (
          <CardHeader className="pb-4">
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <ChartContainer
            config={chartConfig}
            className="[&_.recharts-pie-label-text]:fill-foreground [&_.recharts-pie-label-line]:stroke-border h-[300px] w-full"
          >
            {renderData()}
          </ChartContainer>
        </CardContent>
      </Card>
    );
  } catch (err) {
    return (
      <Card className="my-4 border-destructive/50 bg-destructive/10">
        <CardContent className="p-4 text-sm text-destructive">
          Failed to render chart: Invalid JSON format.
        </CardContent>
      </Card>
    );
  }
}
