"use client";

import * as React from "react";

import { format } from "date-fns";
import { formatSubunits } from "@workspace/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  DateRangePicker,
  cn,
} from "@workspace/ui";
import {
  Building2,
  DollarSign,
  Loader2,
  Receipt,
  TrendingUp,
  User,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import type { SystemMetricsData } from "@workspace/modules/server";

type Props = {
  data: SystemMetricsData;
};

type MetricCardProps = {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  accentClassName: string;
};

function MetricCard({
  title,
  value,
  description,
  icon,
  accentClassName,
}: MetricCardProps) {
  return (
    <Card className="rounded-none border bg-background shadow-none transition-colors hover:bg-accent/5">
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
        <div className="space-y-1">
          <p className="font-medium text-[9px] text-muted-foreground uppercase tracking-[0.2em]">
            {title}
          </p>
        </div>
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center border text-muted-foreground",
            accentClassName,
          )}
        >
          {icon}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="font-medium font-serif text-2xl tracking-tight">
          {value}
        </div>
        <p className="mt-2 max-w-[24ch] text-muted-foreground text-[11px] leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function formatRangeSummary(start?: string | null, end?: string | null) {
  if (!start && !end) {
    return "All time";
  }

  if (start && end) {
    const from = new Date(start);
    const to = new Date(end);

    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return `${format(from, "MMM d")} - ${format(to, "MMM d, yyyy")}`;
    }
  }

  return "Custom range";
}

function formatChartLabel(date: string) {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return format(parsed, "MMM d");
}

function formatYAxisTick(value: number) {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }

  return `$${Math.round(value)}`;
}

export function OverviewClient({ data }: Props) {
  const { filters, handleFilterChange, isPending } = useDataTableFilter({
    initialFilters: { start: null, end: null },
  });

  const range = React.useMemo(() => {
    if (!filters.start && !filters.end) return undefined;

    return {
      from: filters.start ? new Date(filters.start) : undefined,
      to: filters.end ? new Date(filters.end) : undefined,
    };
  }, [filters.end, filters.start]);

  const handleDateSelect = (newRange?: { from?: Date; to?: Date }) => {
    if (!newRange) {
      handleFilterChange({
        ...filters,
        start: null,
        end: null,
      } as typeof filters);
      return;
    }

    const startString = newRange.from
      ? new Date(
          newRange.from.getTime() - newRange.from.getTimezoneOffset() * 60000,
        )
          .toISOString()
          .split("T")[0]
      : null;
    const endString = newRange.to
      ? new Date(
          newRange.to.getTime() - newRange.to.getTimezoneOffset() * 60000,
        )
          .toISOString()
          .split("T")[0]
      : null;

    handleFilterChange({
      ...filters,
      start: startString,
      end: endString,
    } as typeof filters);
  };

  const chartData = React.useMemo(
    () =>
      data.chartData.map((point) => ({
        label: formatChartLabel(point.date),
        revenue: point.revenue / 100,
      })),
    [data.chartData],
  );

  const peakRevenue = React.useMemo(() => {
    return chartData.reduce((max, point) => Math.max(max, point.revenue), 0);
  }, [chartData]);

  const averageRevenue = React.useMemo(() => {
    if (chartData.length === 0) return 0;

    return (
      chartData.reduce((sum, point) => sum + point.revenue, 0) /
      chartData.length
    );
  }, [chartData]);

  const rangeSummary = formatRangeSummary(filters.start, filters.end);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-[11px]">
            <span>{rangeSummary}</span>
            <span className="text-border">/</span>
            <span>
              {data.metrics.totalOrders.toLocaleString()} processed orders
            </span>
            <span className="text-border">/</span>
            <span>
              {data.metrics.activeWorkspaces.toLocaleString()} paid workspaces
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start xl:self-auto">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
          <DateRangePicker
            range={range as any}
            onSelect={handleDateSelect}
            placeholder="Filter by date range..."
            className="min-w-[280px]"
            disabled={isPending}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Revenue"
          value={formatSubunits(data.metrics.totalRevenue, "usd", {
            compact: true,
          })}
          description="All successful revenue."
          icon={<DollarSign className="h-4 w-4" />}
          accentClassName="border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
        />
        <MetricCard
          title="Total Users"
          value={data.metrics.totalUsers.toLocaleString()}
          description="Registered accounts with access to the platform."
          icon={<User className="h-4 w-4" />}
          accentClassName="border-sky-500/20 bg-sky-500/5 text-sky-600"
        />
        <MetricCard
          title="Total Orders"
          value={data.metrics.totalOrders.toLocaleString()}
          description="Completed subscription and invoice orders processed."
          icon={<Receipt className="h-4 w-4" />}
          accentClassName="border-amber-500/20 bg-amber-500/5 text-amber-600"
        />
        <MetricCard
          title="Paid Workspaces"
          value={data.metrics.activeWorkspaces.toLocaleString()}
          description="Active workspaces currently off the free plan."
          icon={<Building2 className="h-4 w-4" />}
          accentClassName="border-violet-500/20 bg-violet-500/5 text-violet-600"
        />
      </div>

      <Card className="rounded-none border bg-background shadow-none">
        <CardHeader className="space-y-4 p-5 pb-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="font-medium text-[9px] text-muted-foreground uppercase tracking-[0.2em]">
                Revenue Trend
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <CardTitle className="font-medium font-serif text-3xl tracking-tight">
                  {formatSubunits(data.metrics.totalRevenue, "usd")}
                </CardTitle>
                <p className="pb-1 text-muted-foreground text-[11px] uppercase tracking-[0.14em]">
                  {rangeSummary}
                </p>
              </div>
              <p className="max-w-2xl text-muted-foreground text-xs leading-relaxed">
                Revenue movement across the selected period, styled to match the
                main app dashboard.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:min-w-[280px]">
              <div className="border bg-accent/20 p-3">
                <p className="font-medium text-[8px] text-muted-foreground uppercase tracking-[0.18em]">
                  Avg Period Revenue
                </p>
                <p className="mt-2 font-medium font-serif text-lg tracking-tight">
                  {formatSubunits(Math.round(averageRevenue * 100), "usd", {
                    compact: true,
                  })}
                </p>
              </div>
              <div className="border bg-accent/20 p-3">
                <p className="font-medium text-[8px] text-muted-foreground uppercase tracking-[0.18em]">
                  Peak Period
                </p>
                <p className="mt-2 font-medium font-serif text-lg tracking-tight">
                  {formatSubunits(Math.round(peakRevenue * 100), "usd", {
                    compact: true,
                  })}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 pt-5">
          {chartData.length > 0 ? (
            <div className="border-t px-2 pb-2 pt-4">
              <ChartContainer
                config={{
                  revenue: {
                    label: "Revenue",
                    color: "hsl(var(--foreground))",
                  },
                }}
                className="h-[340px] w-full"
              >
                <LineChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ top: 12, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    minTickGap={24}
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={60}
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={formatYAxisTick}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        className="rounded-none"
                        formatter={(value) =>
                          formatSubunits(Number(value) * 100, "usd")
                        }
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-revenue)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{
                      r: 4,
                      strokeWidth: 0,
                      fill: "var(--color-revenue)",
                    }}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          ) : (
            <div className="flex h-[320px] items-center justify-center border-t bg-accent/10 px-6 text-center">
              <div className="max-w-sm space-y-2">
                <div className="mx-auto flex size-10 items-center justify-center border bg-background">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="font-medium text-xs">
                  No revenue data found for this period.
                </p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Try expanding the date range or wait until new orders are
                  processed.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
