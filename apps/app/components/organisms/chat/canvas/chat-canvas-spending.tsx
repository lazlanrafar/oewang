"use client";

import {
  BaseCanvas,
  CanvasHeader,
  CanvasContent,
  CanvasSection,
  Skeleton,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui";
import { useAppStore } from "../../../../stores/app";
import { ArtifactTabs, useStaticArtifactData } from "./chat-canvas";
import { CategoryExpenseDonutChart } from "../charts/category-expense-donut-chart";
import { formatAmount } from "../charts/format-amount";

function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <Skeleton className="h-[12px] rounded-none" style={{ width }} />;
}

function SkeletonCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="border p-3 bg-white dark:bg-[#0c0c0c] border-[#e6e6e6] dark:border-[#1d1d1d] space-y-2">
      {children}
    </div>
  );
}

export function SpendingCanvas() {
  const data = useStaticArtifactData("spending-canvas");
  const user = useAppStore((state) => state.user) as any;
  const locale = user?.locale || "en-US";
  const stage = data?.stage;
  const currency = data?.currency || "USD";

  const transactions = data?.transactions || [];
  const metrics = data?.metrics;

  const showTransactions =
    stage && ["metrics_ready", "analysis_ready"].includes(stage);
  const showCards =
    stage && ["metrics_ready", "analysis_ready"].includes(stage);
  const showSummary = stage === "analysis_ready";

  // Build category data for donut chart from transactions
  const categoryMap: Record<string, number> = {};
  for (const tx of transactions) {
    const cat = tx.category || "Uncategorized";
    categoryMap[cat] = (categoryMap[cat] || 0) + (tx.amount || 0);
  }
  const totalSpending = metrics?.totalSpending || Object.values(categoryMap).reduce((a, b) => a + b, 0);
  const categoryDonutData = Object.entries(categoryMap).map(([category, amount]) => ({
    category,
    amount,
    percentage: totalSpending > 0 ? (amount / totalSpending) * 100 : 0,
  }));

  return (
    <BaseCanvas>
      <CanvasHeader tabs={<ArtifactTabs />} />

      <CanvasContent>
        <div className="space-y-8 pb-20">
          {/* Category donut chart - shown when we have data */}
          {showTransactions && categoryDonutData.length > 0 && (
            <div className="mb-2">
              <h4 className="text-[18px] font-normal font-serif text-black dark:text-white mb-4">
                Spending by category
              </h4>
              <CategoryExpenseDonutChart
                data={categoryDonutData}
                currency={currency}
                locale={locale}
                height={260}
              />
              {/* Category legend */}
              <div className="mt-4 space-y-2">
                {categoryDonutData.slice(0, 6).map((item, idx) => (
                  <div key={item.category} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <div
                        className="size-2 rounded-full"
                        style={{
                          backgroundColor: idx === 0
                            ? "hsl(var(--foreground))"
                            : idx === 1 ? "#707070"
                            : idx === 2 ? "#A0A0A0"
                            : idx === 3 ? "#606060"
                            : idx === 4 ? "#404040"
                            : "#303030",
                        }}
                      />
                      <span className="text-[#707070] dark:text-[#666666]">{item.category}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-black dark:text-white">
                        {formatAmount({ amount: item.amount, currency, locale, maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-[#707070] dark:text-[#666666] w-10 text-right">
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
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[18px] font-normal font-serif text-black dark:text-white">
                  Largest transactions
                </h4>
              </div>

              {transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-0">
                      <TableHead className="text-[12px] text-[#707070] dark:text-[#666666] font-normal">
                        Date
                      </TableHead>
                      <TableHead className="text-[12px] text-[#707070] dark:text-[#666666] font-normal">
                        Vendor
                      </TableHead>
                      <TableHead className="text-[12px] text-[#707070] dark:text-[#666666] font-normal">
                        Category
                      </TableHead>
                      <TableHead className="text-right text-[12px] text-[#707070] dark:text-[#666666] font-normal">
                        Amount
                      </TableHead>
                      <TableHead className="text-right text-[12px] text-[#707070] dark:text-[#666666] font-normal">
                        Share
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions
                      .slice(0, 10)
                      .map((transaction: any, index: number) => (
                        <TableRow
                          key={transaction.id || index}
                          className={cn(
                            "cursor-pointer hover:bg-[#F2F1EF] dark:hover:bg-[#0f0f0f] transition-colors",
                            index === transactions.slice(0, 10).length - 1 &&
                              "border-b-0",
                          )}
                        >
                          <TableCell className="text-[12px] text-black dark:text-white">
                            {transaction.date}
                          </TableCell>
                          <TableCell className="text-[12px] text-black dark:text-white">
                            {transaction.vendor || transaction.name}
                          </TableCell>
                          <TableCell className="text-[12px] text-black dark:text-white">
                            {transaction.category}
                          </TableCell>
                          <TableCell className="text-right text-[12px] text-black dark:text-white font-sans">
                            {formatAmount({ amount: transaction.amount, currency, locale, maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-right text-[12px] text-[#707070] dark:text-[#666666]">
                            {(transaction.share ?? 0).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-[12px] text-[#707070] dark:text-[#666666] py-8 text-center">
                  No transactions found
                </div>
              )}
            </div>
          ) : (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <SkeletonLine width="8rem" />
                <SkeletonLine width="6rem" />
              </div>
              <div className="border border-[#e6e6e6] dark:border-[#1d1d1d]">
                <div className="p-3 space-y-3">
                  {Array.from({ length: 5 }, (_, i) => `skeleton-row-${i}`).map(
                    (key) => (
                      <SkeletonLine key={key} width="100%" />
                    ),
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Two summary cards */}
          {showCards ? (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="border p-3 bg-white dark:bg-[#0c0c0c] border-[#e6e6e6] dark:border-[#1d1d1d]">
                <div className="text-[12px] text-[#707070] dark:text-[#666666] mb-1">
                  Spending this month
                </div>
                <div className="text-[18px] font-normal font-sans text-black dark:text-white mb-1">
                  {formatAmount({
                    amount: metrics?.currentMonthSpending || metrics?.totalSpending || 0,
                    currency,
                    locale,
                    maximumFractionDigits: 0,
                  })}
                </div>
                <div className="text-[10px] text-[#707070] dark:text-[#666666]">
                  Across {transactions.length} high-value transaction
                  {transactions.length !== 1 ? "s" : ""}
                </div>
              </div>

              <div className="border p-3 bg-white dark:bg-[#0c0c0c] border-[#e6e6e6] dark:border-[#1d1d1d]">
                <div className="text-[12px] text-[#707070] dark:text-[#666666] mb-1">
                  Top category
                </div>
                <div className="text-[18px] font-normal font-sans text-black dark:text-white mb-1">
                  {metrics?.topCategory
                    ? `${metrics.topCategory.name} — ${formatAmount({ amount: metrics.topCategory.amount, currency, locale, maximumFractionDigits: 0 })}`
                    : "—"}
                </div>
                <div className="text-[10px] text-[#707070] dark:text-[#666666]">
                  Largest share of monthly spend
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {Array.from({ length: 2 }, (_, i) => `skeleton-card-${i}`).map(
                (key) => (
                  <SkeletonCard key={key}>
                    <SkeletonLine width="5rem" />
                    <Skeleton className="h-[18px] w-32 rounded-none mb-1" />
                    <SkeletonLine width="6rem" />
                  </SkeletonCard>
                ),
              )}
            </div>
          )}

          {/* Summary & Recommendations */}
          <CanvasSection
            title="Summary & Recommendations"
            isLoading={!showSummary}
          >
            {data?.analysis?.summary && (
              <div className="space-y-3">
                <div className="whitespace-pre-wrap">
                  {data.analysis.summary}
                </div>
              </div>
            )}
          </CanvasSection>
        </div>
      </CanvasContent>
    </BaseCanvas>
  );
}
