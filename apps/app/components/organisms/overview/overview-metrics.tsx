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
  const { formatCurrency, dictionary } = useAppStore();

  if (!dictionary) return null;

  const fmt = (v: number) => formatCurrency(v);
  const fmtCompact = (v: number) => formatCurrency(v, { compact: true });

  const latestIncome = incomeData[incomeData.length - 1]?.current ?? 0;
  const latestExpense = expenseData[expenseData.length - 1]?.current ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Top: Income and Expense Line Charts side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LineMetricChart
          title={dictionary.overview.metrics.income_total_title}
          description={dictionary.overview.metrics.income_total_desc}
          value={fmt(latestIncome)}
          data={incomeData}
          chartHeight={140}
          formatTooltip={fmt}
          formatYTick={fmtCompact}
        />
        <LineMetricChart
          title={dictionary.overview.metrics.expense_total_title}
          description={dictionary.overview.metrics.expense_total_desc}
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
          title={dictionary.overview.metrics.income_breakdown_title}
          description={dictionary.overview.metrics.current_month_desc}
          data={incomeCategoryData.map((c) => ({
            name: c.name,
            value: c.value,
          }))}
          chartHeight={250}
          formatTooltip={fmt}
          formatYTick={fmtCompact}
        />
        <BarMetricChart
          title={dictionary.overview.metrics.expense_breakdown_title}
          description={dictionary.overview.metrics.current_month_desc}
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
