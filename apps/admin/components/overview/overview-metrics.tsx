"use client";

import { DonutChart, LineMetricChart } from "@workspace/ui";

import type { CategoryBreakdownPoint, ChartDataPoint } from "@/actions/metrics.actions";
import { formatCurrency } from "@/lib/currency";
import type { TransactionSettings } from "@/types/settings";

export function OverviewMetrics({
  revenueData,
  expenseData,
  burnRateData,
  categoryData,
  settings,
}: {
  revenueData: ChartDataPoint[];
  expenseData: ChartDataPoint[];
  burnRateData: ChartDataPoint[];
  categoryData: CategoryBreakdownPoint[];
  settings?: TransactionSettings | null;
}) {
  const fmt = (v: number) => formatCurrency(v, settings);

  const latestRevenue = revenueData[revenueData.length - 1]?.current ?? 0;
  const latestBurnRate = burnRateData[burnRateData.length - 1]?.current ?? 0;
  const latestExpense = expenseData[expenseData.length - 1]?.current ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Left column — two stacked line charts */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <LineMetricChart
            title="Revenue"
            description="Revenue"
            value={fmt(latestRevenue)}
            data={revenueData}
            chartHeight={140}
            formatTooltip={fmt}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LineMetricChart
              title="Average Monthly Burn Rate"
              description="Burn Rate"
              value={fmt(latestBurnRate)}
              data={burnRateData}
              chartHeight={110}
              formatTooltip={fmt}
            />
            <LineMetricChart
              title="Total Expenses"
              description="Expenses"
              value={fmt(latestExpense)}
              data={expenseData}
              chartHeight={110}
              formatTooltip={fmt}
            />
          </div>
        </div>

        {/* Right column — donut chart */}
        <div className="lg:col-span-1 relative">
          <div className="h-[420px] lg:h-auto lg:absolute lg:inset-0 w-full">
            <DonutChart
              title="Expense Breakdown"
              description="Current Month"
              data={categoryData}
              maxSlices={7}
              formatValue={fmt}
              footerLabel="Total Expenses"
              chartHeight={300}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
