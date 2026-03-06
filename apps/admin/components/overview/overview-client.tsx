"use client";

import React from "react";
import { formatCurrency } from "@workspace/utils";
import {
  StatCard,
  LineMetricChart,
  DateRangePicker,
  Icons,
} from "@workspace/ui";
import { DollarSign, User, Receipt, Building, Loader2 } from "lucide-react";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { SystemMetricsData } from "@workspace/modules/server";

type Props = {
  data: SystemMetricsData;
};

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
  }, [filters.start, filters.end]);

  const handleDateSelect = (newRange?: any) => {
    if (!newRange) {
      handleFilterChange({ ...filters, start: null, end: null } as any);
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
    } as any);
  };

  const chartDataTransform = React.useMemo(() => {
    return data.chartData.map((d) => ({
      name: d.date,
      current: d.revenue / 100, // convert cents to whole currency for display
    }));
  }, [data.chartData]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
        <div className="flex items-center gap-2">
          {isPending && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-2" />
          )}
          <DateRangePicker
            range={range as any}
            onSelect={handleDateSelect}
            placeholder="Filter by date range..."
            className="w-full sm:w-[300px]"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.metrics.totalRevenue, {
            mainCurrencySymbol: "$",
          })}
          icon={<DollarSign className="w-4 h-4" />}
          description="Total net revenue from paid orders"
        />
        <StatCard
          title="Total Users"
          value={data.metrics.totalUsers.toLocaleString()}
          icon={<User className="w-4 h-4" />}
          description="Total registered users"
        />
        <StatCard
          title="Total Orders"
          value={data.metrics.totalOrders.toLocaleString()}
          icon={<Receipt className="w-4 h-4" />}
          description="Total processed orders"
        />
        <StatCard
          title="Active Paid Workspaces"
          value={data.metrics.activeWorkspaces.toLocaleString()}
          icon={<Building className="w-4 h-4" />}
          description="Workspaces not on free plan"
        />
      </div>

      {data.chartData.length > 0 ? (
        <LineMetricChart
          title="Revenue Over Time"
          data={chartDataTransform}
          value={formatCurrency(data.metrics.totalRevenue, {
            mainCurrencySymbol: "$",
          })}
          description="Revenue trend"
          currentKey="current"
          currentColor="var(--primary)"
          formatYTick={(val) => `$${(val / 1000).toFixed(1)}k`}
          formatTooltip={(val) =>
            formatCurrency(val * 100, { mainCurrencySymbol: "$" })
          }
          chartHeight={300}
        />
      ) : (
        <div className="flex h-[300px] items-center justify-center border border-dashed rounded-lg text-muted-foreground">
          No revenue data found for this period.
        </div>
      )}
    </div>
  );
}
