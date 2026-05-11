"use client";

import {
  BaseCanvas,
  CanvasChart,
  CanvasContent,
  CanvasHeader,
  CanvasSection,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  shouldShowChart,
  shouldShowMetricsSkeleton,
  shouldShowSummarySkeleton,
} from "@workspace/ui";

import { useAppStore } from "@/stores/app";
import { getDictionaryText } from "../chat-i18n";
import { formatAmount } from "../charts/format-amount";
import { RevenueTrendChart } from "../charts/revenue-trend-chart";
import { ArtifactTabs, useStaticArtifactData } from "./chat-canvas";

export function RevenueCanvas({ dataOverride }: { dataOverride?: Record<string, unknown> | null } = {}) {
  const data = (dataOverride ?? (useStaticArtifactData("revenue-canvas") as Record<string, unknown> | null) ?? {});
  const dictionary = useAppStore((state) => state.dictionary);
  const t = (key: string, fallback: string, params?: Record<string, string | number>) =>
    getDictionaryText(dictionary, key, fallback, params);
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const stage = data.stage as string | undefined;
  const currency = (data.currency as string) || "USD";
  const metrics = (data.metrics as Record<string, unknown> | undefined) ?? {};
  const analysis = (data.analysis as Record<string, unknown> | undefined) ?? {};
  const chart = (data.chart as Record<string, unknown> | undefined) ?? {};
  const transactionsRaw = Array.isArray(data.transactions) ? (data.transactions as Record<string, unknown>[]) : [];
  const monthlyData = Array.isArray(chart.monthlyData) ? (chart.monthlyData as Record<string, unknown>[]) : [];
  const currentMonthIncome = Number(metrics.currentMonthRevenue) || 0;
  const averageMonthlyIncome = Number(metrics.averageMonthlyRevenue) || 0;
  const totalIncome = Number(metrics.totalRevenue) || 0;

  // Map monthly data if available (Oewang may return flat metrics, not chart data)
  const monthlyRevenueData = monthlyData.map((item: Record<string, unknown>) => ({
    month: String(item.month ?? ""),
    revenue: Number(item.revenue) || 0,
    lastYearRevenue: Number(item.lastYearRevenue) || 0,
    average: Number(item.average) || 0,
  }));

  const revenueData =
    monthlyRevenueData.length > 0
      ? monthlyRevenueData
      : [
          {
            month: t("chat.canvas.common.current", "Current"),
            revenue: currentMonthIncome,
            lastYearRevenue: 0,
            average: averageMonthlyIncome,
          },
          {
            month: t("chat.canvas.common.average", "Average"),
            revenue: averageMonthlyIncome,
            lastYearRevenue: 0,
            average: averageMonthlyIncome,
          },
        ];

  const transactionCategoryMap: Record<string, number> = {};
  for (const tx of transactionsRaw) {
    const category = String(tx.category ?? tx.source ?? t("chat.canvas.common.uncategorized", "Uncategorized"));
    transactionCategoryMap[category] = (transactionCategoryMap[category] || 0) + (Number(tx.amount) || 0);
  }

  const derivedTopCategory = Object.entries(transactionCategoryMap).sort((a, b) => b[1] - a[1])[0];
  const metricsTopCategory = (metrics.topCategory as Record<string, unknown> | undefined) ?? null;
  const topCategoryName = String(metricsTopCategory?.name ?? derivedTopCategory?.[0] ?? "—");
  const topCategoryAmount = Number(metricsTopCategory?.amount ?? derivedTopCategory?.[1] ?? 0);

  const latestIncome =
    transactionsRaw.length > 0
      ? transactionsRaw.map((transaction, index) => ({
          id: String(transaction.id ?? `income-${index}`),
          date: String(transaction.date ?? "-"),
          vendor: String(transaction.vendor ?? transaction.name ?? "-"),
          category: String(transaction.category ?? transaction.source ?? t("chat.canvas.revenue.income_label", "Income")),
          amount: Number(transaction.amount) || 0,
        }))
      : revenueData
          .filter((item) => item.revenue > 0)
          .map((item, index) => ({
            id: `revenue-${item.month}-${index}`,
            date: item.month,
            vendor: t("chat.canvas.revenue.monthly_total", "Monthly total"),
            category: t("chat.canvas.revenue.income_label", "Income"),
            amount: item.revenue,
          }));

  const showChart = shouldShowChart(stage) && revenueData.length > 0;

  return (
    <BaseCanvas>
      <CanvasHeader tabs={<ArtifactTabs />} />

      <CanvasContent>
        <div className="space-y-8 pb-20">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-[#e6e6e6] bg-white p-3 dark:border-[#1d1d1d] dark:bg-[#0c0c0c]">
              <div className="mb-1 text-[#707070] text-[12px] dark:text-[#666666]">
                {t("chat.canvas.revenue.income_this_month", "Income this month")}
              </div>
              <div className="mb-1 font-normal font-sans text-[18px] text-black dark:text-white">
                {formatAmount({
                  amount: currentMonthIncome,
                  currency,
                  locale,
                  maximumFractionDigits: 0,
                })}
              </div>
              <div className="text-[#707070] text-[10px] dark:text-[#666666]">
                {t("chat.canvas.revenue.latest_period", "Latest period")}
              </div>
            </div>

            <div className="border border-[#e6e6e6] bg-white p-3 dark:border-[#1d1d1d] dark:bg-[#0c0c0c]">
              <div className="mb-1 text-[#707070] text-[12px] dark:text-[#666666]">
                {t("chat.canvas.common.top_category", "Top category")}
              </div>
              <div className="mb-1 font-normal font-sans text-[18px] text-black dark:text-white">
                {topCategoryName !== "—"
                  ? `${topCategoryName} — ${formatAmount({ amount: topCategoryAmount, currency, locale, maximumFractionDigits: 0 })}`
                  : "—"}
              </div>
              <div className="text-[#707070] text-[10px] dark:text-[#666666]">
                {t("chat.canvas.revenue.largest_share_income", "Largest share of total income")}
              </div>
            </div>
          </div>

          {/* Income Trend Chart */}
          {showChart && (
            <CanvasChart
              title={t("chat.canvas.revenue.monthly_income_trend", "Monthly Income Trend")}
              legend={{
                items: [
                  { label: t("chat.canvas.revenue.legend_this_year", "This Year"), type: "solid" },
                  { label: t("chat.canvas.revenue.legend_last_year", "Last Year"), type: "solid" },
                  { label: t("chat.canvas.common.average", "Average"), type: "pattern" },
                ],
              }}
              isLoading={shouldShowMetricsSkeleton(stage)}
              height="20rem"
            >
              <RevenueTrendChart
                data={revenueData}
                height={320}
                showLegend={false}
                currency={currency}
                locale={locale}
              />
            </CanvasChart>
          )}

          <div className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-normal font-serif text-[18px] text-black dark:text-white">
                {t("chat.canvas.revenue.latest_income", "Latest income")}
              </h4>
            </div>

            {latestIncome.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-b-0">
                    <TableHead className="font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                      {t("chat.canvas.common.date", "Date")}
                    </TableHead>
                    <TableHead className="font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                      {t("chat.canvas.revenue.source", "Source")}
                    </TableHead>
                    <TableHead className="font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                      {t("chat.canvas.common.category", "Category")}
                    </TableHead>
                    <TableHead className="text-right font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                      {t("chat.canvas.common.amount", "Amount")}
                    </TableHead>
                    <TableHead className="text-right font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                      {t("chat.canvas.common.share", "Share")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestIncome.slice(0, 10).map((transaction, index) => {
                    const amount = Number(transaction.amount) || 0;
                    const shareBase = totalIncome > 0 ? totalIncome : latestIncome.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                    const share = shareBase > 0 ? (amount / shareBase) * 100 : 0;

                    return (
                      <TableRow key={String(transaction.id ?? `income-${index}`)}>
                        <TableCell className="text-[12px] text-black dark:text-white">{transaction.date}</TableCell>
                        <TableCell className="text-[12px] text-black dark:text-white">{transaction.vendor}</TableCell>
                        <TableCell className="text-[12px] text-black dark:text-white">{transaction.category}</TableCell>
                        <TableCell className="text-right font-sans text-[12px] text-black dark:text-white">
                          {formatAmount({ amount, currency, locale, maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="text-right text-[#707070] text-[12px] dark:text-[#666666]">
                          {share.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-[#707070] text-[12px] dark:text-[#666666]">
                {t("chat.canvas.revenue.no_income_found", "No income found")}
              </div>
            )}
          </div>

          {/* Summary */}
          <CanvasSection title={t("chat.canvas.common.summary", "Summary")} isLoading={shouldShowSummarySkeleton(stage)}>
            {(analysis.summary as string) || t("chat.canvas.revenue.no_summary", "No income summary available yet.")}
          </CanvasSection>
        </div>
      </CanvasContent>
    </BaseCanvas>
  );
}
