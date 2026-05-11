"use client";

import {
  BaseCanvas,
  CanvasContent,
  CanvasHeader,
  CanvasSection,
  cn,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui";

import { useAppStore } from "@/stores/app";
import { getDictionaryText } from "../chat-i18n";
import { CategoryExpenseDonutChart } from "../charts/category-expense-donut-chart";
import { formatAmount } from "../charts/format-amount";
import { ArtifactTabs, useStaticArtifactData } from "./chat-canvas";

function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <Skeleton className="h-[12px] rounded-none" style={{ width }} />;
}

function SkeletonCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2 border border-[#e6e6e6] bg-white p-3 dark:border-[#1d1d1d] dark:bg-[#0c0c0c]">
      {children}
    </div>
  );
}

export function SpendingCanvas({ dataOverride }: { dataOverride?: Record<string, unknown> | null } = {}) {
  const data = (dataOverride ?? (useStaticArtifactData("spending-canvas") as Record<string, unknown> | null) ?? {});
  const dictionary = useAppStore((state) => state.dictionary);
  const t = (key: string, fallback: string, params?: Record<string, string | number>) =>
    getDictionaryText(dictionary, key, fallback, params);
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const stage = data.stage as string | undefined;
  const currency = (data.currency as string) || "USD";

  const transactions = Array.isArray(data.transactions) ? (data.transactions as Record<string, unknown>[]) : [];
  const metrics = (data.metrics as Record<string, unknown> | undefined) ?? {};
  const analysis = (data.analysis as Record<string, unknown> | undefined) ?? {};

  const showTransactions = stage && ["metrics_ready", "analysis_ready"].includes(stage);
  const showCards = stage && ["metrics_ready", "analysis_ready"].includes(stage);
  const showSummary = stage === "analysis_ready";

  // Build category data for donut chart from transactions
  const categoryMap: Record<string, number> = {};
  for (const tx of transactions) {
    const cat = String(tx.category ?? t("chat.canvas.common.uncategorized", "Uncategorized"));
    categoryMap[cat] = (categoryMap[cat] || 0) + (Number(tx.amount) || 0);
  }
  const totalSpending = Number(metrics.totalSpending) || Object.values(categoryMap).reduce((a, b) => a + b, 0);
  const categoryDonutData = Object.entries(categoryMap).map(([category, amount]) => ({
    category,
    amount,
    percentage: totalSpending > 0 ? (amount / totalSpending) * 100 : 0,
  }));
  const topCategory = (metrics.topCategory as Record<string, unknown> | undefined) ?? undefined;

  return (
    <BaseCanvas>
      <CanvasHeader tabs={<ArtifactTabs />} />

      <CanvasContent>
        <div className="space-y-8 pb-20">
          {/* Two summary cards */}
          {showCards ? (
            <div className="mb-6 grid grid-cols-2 gap-3">
              <div className="border border-[#e6e6e6] bg-white p-3 dark:border-[#1d1d1d] dark:bg-[#0c0c0c]">
                <div className="mb-1 text-[#707070] text-[12px] dark:text-[#666666]">
                  {t("chat.canvas.spending.expense_this_month", "Expense this month")}
                </div>
                <div className="mb-1 font-normal font-sans text-[18px] text-black dark:text-white">
                  {formatAmount({
                    amount: Number(metrics.currentMonthSpending) || Number(metrics.totalSpending) || 0,
                    currency,
                    locale,
                    maximumFractionDigits: 0,
                  })}
                </div>
                <div className="text-[#707070] text-[10px] dark:text-[#666666]">
                  {t("chat.canvas.spending.across_transactions", "Across {count} high-value transactions", {
                    count: transactions.length,
                  })}
                </div>
              </div>

              <div className="border border-[#e6e6e6] bg-white p-3 dark:border-[#1d1d1d] dark:bg-[#0c0c0c]">
                <div className="mb-1 text-[#707070] text-[12px] dark:text-[#666666]">
                  {t("chat.canvas.common.top_category", "Top category")}
                </div>
                <div className="mb-1 font-normal font-sans text-[18px] text-black dark:text-white">
                  {topCategory
                    ? `${String(topCategory.name ?? "—")} — ${formatAmount({ amount: Number(topCategory.amount) || 0, currency, locale, maximumFractionDigits: 0 })}`
                    : "—"}
                </div>
                <div className="text-[#707070] text-[10px] dark:text-[#666666]">
                  {t("chat.canvas.spending.largest_share_expense", "Largest share of monthly expense")}
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6 grid grid-cols-2 gap-3">
              {Array.from({ length: 2 }, (_, i) => `skeleton-card-${i}`).map((key) => (
                <SkeletonCard key={key}>
                  <SkeletonLine width="5rem" />
                  <Skeleton className="mb-1 h-[18px] w-32 rounded-none" />
                  <SkeletonLine width="6rem" />
                </SkeletonCard>
              ))}
            </div>
          )}

          {/* Category donut chart - shown when we have data */}
          {showTransactions && categoryDonutData.length > 0 && (
            <div className="mb-2">
              <h4 className="mb-4 font-normal font-serif text-[18px] text-black dark:text-white">
                {t("chat.canvas.spending.expense_by_category", "Expense by category")}
              </h4>
              <CategoryExpenseDonutChart data={categoryDonutData} currency={currency} locale={locale} height={260} />
              {/* Category legend */}
              <div className="mt-4 space-y-2">
                {categoryDonutData.slice(0, 6).map((item, idx) => (
                  <div key={item.category} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <div
                        className="size-2 rounded-full"
                        style={{
                          backgroundColor:
                            idx === 0
                              ? "hsl(var(--foreground))"
                              : idx === 1
                                ? "#707070"
                                : idx === 2
                                  ? "#A0A0A0"
                                  : idx === 3
                                    ? "#606060"
                                    : idx === 4
                                      ? "#404040"
                                      : "#303030",
                        }}
                      />
                      <span className="text-[#707070] dark:text-[#666666]">{item.category}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-black dark:text-white">
                        {formatAmount({ amount: item.amount, currency, locale, maximumFractionDigits: 0 })}
                      </span>
                      <span className="w-10 text-right text-[#707070] dark:text-[#666666]">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Largest transactions section */}
          {showTransactions ? (
            <div className="mb-6">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="font-normal font-serif text-[18px] text-black dark:text-white">
                  {t("chat.canvas.spending.largest_transactions", "Largest transactions")}
                </h4>
              </div>

              {transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-0">
                      <TableHead className="w-[84px] whitespace-nowrap font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                        {t("chat.canvas.common.date", "Date")}
                      </TableHead>
                      <TableHead className="font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                        {t("chat.canvas.spending.vendor", "Description")}
                      </TableHead>
                      <TableHead className="font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                        {t("chat.canvas.common.category", "Category")}
                      </TableHead>
                      <TableHead className="text-right font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                        {t("chat.canvas.common.amount", "Amount")}
                      </TableHead>
                      <TableHead className="border-r text-right font-normal text-[#707070] text-[12px] dark:text-[#666666]">
                        {t("chat.canvas.common.share", "Share")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.slice(0, 10).map((transaction, index: number) => {
                      const keyValue = transaction.id;
                      const rowKey =
                        typeof keyValue === "string" || typeof keyValue === "number" ? String(keyValue) : index;
                      const date = String(transaction.date ?? "-");
                      const vendor = String(transaction.vendor ?? transaction.name ?? "-");
                      const category = String(transaction.category ?? t("chat.canvas.common.uncategorized", "Uncategorized"));
                      const amount = Number(transaction.amount) || 0;
                      const share = Number(transaction.share) || 0;

                      return (
                        <TableRow
                          key={rowKey}
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-[#F2F1EF] dark:hover:bg-[#0f0f0f]",
                            index === transactions.slice(0, 10).length - 1 && "border-b-0",
                          )}
                        >
                          <TableCell className="w-[84px] whitespace-nowrap text-[12px] text-black dark:text-white">
                            {date}
                          </TableCell>
                          <TableCell
                            className="max-w-[220px] truncate text-[12px] text-black dark:text-white"
                            title={vendor}
                          >
                            {vendor}
                          </TableCell>
                          <TableCell
                            className="max-w-[140px] truncate text-[12px] text-black dark:text-white"
                            title={category}
                          >
                            {category}
                          </TableCell>
                          <TableCell className="text-right font-sans text-[12px] text-black dark:text-white">
                            {formatAmount({ amount, currency, locale, maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="border-r text-right text-[#707070] text-[12px] dark:text-[#666666]">
                            {share.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-[#707070] text-[12px] dark:text-[#666666]">
                  {t("chat.canvas.spending.no_transactions_found", "No transactions found")}
                </div>
              )}
            </div>
          ) : (
            <div className="mb-6">
              <div className="mb-4 flex items-center justify-between">
                <SkeletonLine width="8rem" />
                <SkeletonLine width="6rem" />
              </div>
              <div className="border border-[#e6e6e6] dark:border-[#1d1d1d]">
                <div className="space-y-3 p-3">
                  {Array.from({ length: 5 }, (_, i) => `skeleton-row-${i}`).map((key) => (
                    <SkeletonLine key={key} width="100%" />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Summary & Recommendations */}
          <CanvasSection
            title={t("chat.canvas.spending.summary_recommendations", "Summary & Recommendations")}
            isLoading={!showSummary}
          >
            {Boolean(analysis.summary) && (
              <div className="space-y-3">
                <div className="whitespace-pre-wrap">{String(analysis.summary)}</div>
              </div>
            )}
          </CanvasSection>
        </div>
      </CanvasContent>
    </BaseCanvas>
  );
}
