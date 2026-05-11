"use client";

import type { CategoryBreakdownPoint, ChartDataPoint } from "@workspace/modules/metrics/metrics.action";
import type { TransactionSettings } from "@workspace/types";
import { CanvasChart } from "@workspace/ui";

import type { AppDictionary } from "@/modules/types/dictionary";

import { BurnRateChart } from "../chat/charts/burn-rate-chart";
import { ExpensesChart } from "../chat/charts/expenses-chart";
import { RevenueChart } from "../chat/charts/revenue-chart";

function ChartEmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center border border-dashed border-[#e6e6e6] text-[#707070] text-[12px] dark:border-[#1d1d1d] dark:text-[#666666]">
      {label}
    </div>
  );
}

function truncateLabel(label: string, max = 16) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function OverviewMetrics({
  incomeData,
  expenseData,
  burnRateData,
  incomeCategoryData,
  expenseCategoryData,
  dictionary,
  settings,
  locale,
  rangeLabel,
}: {
  incomeData: ChartDataPoint[];
  expenseData: ChartDataPoint[];
  burnRateData: ChartDataPoint[];
  incomeCategoryData: CategoryBreakdownPoint[];
  expenseCategoryData: CategoryBreakdownPoint[];
  dictionary: AppDictionary;
  settings?: TransactionSettings | null;
  locale: string;
  rangeLabel: string;
}) {
  if (!dictionary) return null;

  const currency = settings?.mainCurrencyCode || "USD";
  const averageLabel = "Average";

  const incomeTrendData = incomeData.map((point) => ({
    month: point.name,
    revenue: point.current,
    target: point.average ?? point.previous ?? 0,
  }));

  const expenseTrendData = expenseData.map((point) => ({
    month: point.name,
    revenue: point.current,
    target: point.average ?? point.previous ?? 0,
  }));

  const burnTrendData = burnRateData.map((point) => ({
    month: point.name,
    amount: point.current,
    average: point.average ?? 0,
    currentBurn: point.current,
    averageBurn: point.average ?? 0,
  }));

  const incomeBreakdownData = [...incomeCategoryData]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((item) => ({
      month: truncateLabel(item.name),
      amount: item.value,
      category: item.name,
    }));

  const expenseBreakdownData = [...expenseCategoryData]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((item) => ({
      month: truncateLabel(item.name),
      amount: item.value,
      category: item.name,
    }));

  return (
    <div className="space-y-8">
      <div className="grid gap-8 xl:grid-cols-2">
        <CanvasChart
          title={dictionary.overview.metrics.income_total_desc}
          legend={{ items: [{ label: dictionary.transactions.types.income, type: "solid" }, { label: averageLabel, type: "pattern" }] }}
          height="20rem"
        >
          {incomeTrendData.length > 0 ? (
            <RevenueChart
              data={incomeTrendData}
              height={320}
              showLegend={false}
              currency={currency}
              locale={locale}
              primaryLabel={dictionary.transactions.types.income}
              secondaryLabel={averageLabel}
              title={dictionary.overview.metrics.income_total_desc}
            />
          ) : (
            <ChartEmptyState label={`No income data in ${rangeLabel.toLowerCase()}.`} />
          )}
        </CanvasChart>

        <CanvasChart
          title={dictionary.overview.metrics.expense_total_desc}
          legend={{ items: [{ label: dictionary.transactions.types.expense, type: "solid" }, { label: averageLabel, type: "pattern" }] }}
          height="20rem"
        >
          {expenseTrendData.length > 0 ? (
            <RevenueChart
              data={expenseTrendData}
              height={320}
              showLegend={false}
              currency={currency}
              locale={locale}
              primaryLabel={dictionary.transactions.types.expense}
              secondaryLabel={averageLabel}
              title={dictionary.overview.metrics.expense_total_desc}
            />
          ) : (
            <ChartEmptyState label={`No expenses in ${rangeLabel.toLowerCase()}.`} />
          )}
        </CanvasChart>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <CanvasChart title={dictionary.overview.metrics.income_breakdown_title} height="20rem">
          {incomeBreakdownData.length > 0 ? (
            <ExpensesChart
              data={incomeBreakdownData}
              height={320}
              showLegend={false}
              currency={currency}
              locale={locale}
              valueLabel={dictionary.transactions.types.income}
              title={dictionary.overview.metrics.income_breakdown_title}
            />
          ) : (
            <ChartEmptyState label={`No income categories in ${rangeLabel.toLowerCase()}.`} />
          )}
        </CanvasChart>

        <CanvasChart title={dictionary.overview.metrics.expense_breakdown_title} height="20rem">
          {expenseBreakdownData.length > 0 ? (
            <ExpensesChart
              data={expenseBreakdownData}
              height={320}
              showLegend={false}
              currency={currency}
              locale={locale}
              valueLabel={dictionary.transactions.types.expense}
              title={dictionary.overview.metrics.expense_breakdown_title}
            />
          ) : (
            <ChartEmptyState label={`No expense categories in ${rangeLabel.toLowerCase()}.`} />
          )}
        </CanvasChart>
      </div>
      <div>
        <CanvasChart
          title="Burn Rate"
          legend={{ items: [{ label: "Current", type: "solid" }, { label: averageLabel, type: "pattern" }] }}
          height="20rem"
        >
          {burnTrendData.length > 0 ? (
            <BurnRateChart data={burnTrendData} height={320} currency={currency} locale={locale} />
          ) : (
            <ChartEmptyState label={`No burn-rate data in ${rangeLabel.toLowerCase()}.`} />
          )}
        </CanvasChart>
      </div>
    </div>
  );
}
