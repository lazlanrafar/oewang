"use client";

import * as React from "react";
import { formatCurrency } from "@/lib/currency";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { ChartDataPoint } from "@/actions/metrics.actions";

const chartConfig = {
  current: {
    label: "Current",
    color: "hsl(var(--primary))",
  },
  average: {
    label: "Average",
    color: "hsl(var(--muted-foreground))",
  },
} satisfies ChartConfig;

function MetricLineChart({
  title,
  data,
}: {
  title: string;
  data: ChartDataPoint[];
}) {
  const currentTotal = data[data.length - 1]?.current || 0;

  return (
    <Card className="flex flex-col h-full bg-background border-border overflow-hidden">
      <CardHeader className="items-start pb-0">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl font-medium tracking-tight">
          {formatCurrency(currentTotal, null)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pb-0 mt-4 h-[250px]">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <LineChart
            accessibilityLayer
            data={data}
            margin={{
              left: -20,
              right: 12,
              top: 12,
              bottom: 12,
            }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `${value / 1000}k`}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="average"
              stroke="var(--color-average)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="current"
              stroke="var(--color-current)"
              strokeWidth={2}
              dot={{
                r: 4,
                fill: "var(--color-current)",
              }}
              activeDot={{
                r: 6,
              }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function OverviewMetrics({
  revenueData,
  expenseData,
  burnRateData,
}: {
  revenueData: ChartDataPoint[];
  expenseData: ChartDataPoint[];
  burnRateData: ChartDataPoint[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="w-full">
        <MetricLineChart title="Revenue" data={revenueData} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricLineChart
          title="Average Monthly Burn Rate"
          data={burnRateData}
        />
        <MetricLineChart title="Total Expenses" data={expenseData} />
      </div>
    </div>
  );
}
