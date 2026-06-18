"use client";

import {
  BaseCanvas,
  CanvasContent,
  CanvasGrid,
  CanvasHeader,
  CanvasSection,
  cn,
  shouldShowMetricsSkeleton,
  shouldShowSummarySkeleton,
} from "@workspace/ui";

import { useAppStore } from "@/stores/app";

import { formatAmount } from "../charts/format-amount";
import { getDictionaryText } from "../chat-i18n";
import { ArtifactTabs, useStaticArtifactData } from "./chat-canvas";

export function BudgetCanvas({ dataOverride }: { dataOverride?: Record<string, unknown> | null } = {}) {
  const artifactData = useStaticArtifactData("budget-canvas") as Record<string, unknown> | null;
  const data = dataOverride ?? artifactData ?? {};
  const dictionary = useAppStore((state) => state.dictionary);
  const t = (key: string, fallback: string) => getDictionaryText(dictionary, key, fallback);
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const currency = (data.currency as string) || "USD";
  const stage = data.stage as string | undefined;
  const metrics = (data.metrics as Record<string, unknown> | undefined) ?? {};
  const analysis = (data.analysis as Record<string, unknown> | undefined) ?? {};
  const budgets = Array.isArray(data.budgets) ? (data.budgets as Record<string, unknown>[]) : [];

  const budgetMetrics = Object.keys(metrics).length
    ? [
        {
          id: "spent",
          title: t("chat.canvas.budget.spent", "Spent"),
          value: formatAmount({ amount: Number(metrics.totalSpent) || 0, currency, locale, maximumFractionDigits: 0 }),
          subtitle: t("chat.canvas.budget.of_budget", "of {total} budget").replace(
            "{total}",
            formatAmount({ amount: Number(metrics.totalBudget) || 0, currency, locale, maximumFractionDigits: 0 }),
          ),
        },
        {
          id: "remaining",
          title: t("chat.canvas.budget.remaining", "Remaining"),
          value: formatAmount({ amount: Number(metrics.remaining) || 0, currency, locale, maximumFractionDigits: 0 }),
          subtitle: `${Number(metrics.percentage) || 0}% ${t("chat.canvas.budget.used", "used")}`,
        },
      ]
    : [];

  const showCategories = stage && ["metrics_ready", "analysis_ready"].includes(stage);

  return (
    <BaseCanvas>
      <CanvasHeader tabs={<ArtifactTabs />} />

      <CanvasContent>
        <div className="space-y-8 pb-20">
          <CanvasGrid items={budgetMetrics} layout="2/2" isLoading={shouldShowMetricsSkeleton(stage)} />

          {showCategories && budgets.length > 0 && (
            <div className="mb-6">
              <h4 className="mb-4 font-normal font-serif text-[18px] text-black dark:text-white">
                {t("chat.canvas.budget.by_category", "Budget by category")}
              </h4>
              <div className="space-y-4">
                {budgets.map((budget, index) => {
                  const keyValue = budget.id;
                  const rowKey =
                    typeof keyValue === "string" || typeof keyValue === "number" ? String(keyValue) : index;
                  const pct = Number(budget.percentage) || 0;
                  const over = pct > 100;
                  return (
                    <div key={rowKey} className="space-y-1.5">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-black dark:text-white">{String(budget.category ?? "—")}</span>
                        <span className="text-[#707070] dark:text-[#666666]">
                          {formatAmount({
                            amount: Number(budget.spent) || 0,
                            currency,
                            locale,
                            maximumFractionDigits: 0,
                          })}
                          {" / "}
                          {formatAmount({
                            amount: Number(budget.amount) || 0,
                            currency,
                            locale,
                            maximumFractionDigits: 0,
                          })}
                          <span
                            className={cn(
                              "ml-2",
                              over ? "text-red-600 dark:text-red-500" : "text-[#707070] dark:text-[#666666]",
                            )}
                          >
                            {pct}%
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-[#e6e6e6] dark:bg-[#1d1d1d]">
                        <div
                          className={cn("h-full", over ? "bg-red-600 dark:bg-red-500" : "bg-black dark:bg-white")}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <CanvasSection
            title={t("chat.canvas.common.summary", "Summary")}
            isLoading={shouldShowSummarySkeleton(stage)}
          >
            {String(analysis.summary ?? "")}
          </CanvasSection>
        </div>
      </CanvasContent>
    </BaseCanvas>
  );
}
