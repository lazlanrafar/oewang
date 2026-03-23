"use client";

import { BarMetricChart, LineMetricChart } from "@workspace/ui";

import type {
  CategoryBreakdownPoint,
  ChartDataPoint,
} from "@workspace/modules/metrics/metrics.action";
import { useAppStore } from "@/stores/app";

export function OverviewMetrics({
  incomeData,
  expenseData,
  burnRateData,
  incomeCategoryData,
  expenseCategoryData,
}: {
  incomeData: ChartDataPoint[];
  expenseData: ChartDataPoint[];
  burnRateData: ChartDataPoint[];
  incomeCategoryData: CategoryBreakdownPoint[];
  expenseCategoryData: CategoryBreakdownPoint[];
}) {
  const { formatCurrency } = useAppStore();
  const fmt = (v: number) => formatCurrency(v);
  const fmtCompact = (v: number) => formatCurrency(v, { compact: true });

  const latestIncome = incomeData[incomeData.length - 1]?.current ?? 0;
  const latestExpense = expenseData[expenseData.length - 1]?.current ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Top: Income and Expense Line Charts side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LineMetricChart
          title="Total Income"
          description="Income over time"
          value={fmt(latestIncome)}
          data={incomeData}
          chartHeight={140}
          formatTooltip={fmt}
          formatYTick={fmtCompact}
        />
        <LineMetricChart
          title="Total Expenses"
          description="Expenses over time"
          value={fmt(latestExpense)}
          data={expenseData}
          chartHeight={140}
          formatTooltip={fmt}
          formatYTick={fmtCompact}
        />
      </div>

      {/* Bottom: Income and Expense Breakdown Bar Charts side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BarMetricChart
          title="Income Breakdown"
          description="Current Month"
          data={incomeCategoryData.map((c) => ({
            name: c.name,
            value: c.value,
          }))}
          chartHeight={250}
          formatTooltip={fmt}
          formatYTick={fmtCompact}
        />
        <BarMetricChart
          title="Expense Breakdown"
          description="Current Month"
          data={expenseCategoryData.map((c) => ({
            name: c.name,
            value: c.value,
          }))}
          chartHeight={250}
          formatTooltip={fmt}
          formatYTick={fmtCompact}
        />
      </div>
    </div>
  );
}
