"use client";

import type { TransactionSettings } from "@workspace/types";
import { DataTablePageCard } from "@workspace/ui";
import { formatCurrency } from "@workspace/utils";

interface BudgetClientCardsProps {
  totalBudgeted: number;
  totalSpent: number;
  usagePercent: number;
  isLoading: boolean;
  settings: TransactionSettings | null;
  locale: string;
}

export function BudgetClientCards({
  totalBudgeted,
  totalSpent,
  usagePercent,
  isLoading,
  settings,
  locale,
}: BudgetClientCardsProps) {
  const isOver = usagePercent > 100;
  const isWarning = usagePercent >= 80 && !isOver;
  const usageColor = isOver
    ? "text-destructive"
    : isWarning
      ? "text-yellow-600 dark:text-yellow-500"
      : undefined;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <DataTablePageCard
        label="Total Monthly Budget"
        value={totalBudgeted}
        isLoading={isLoading}
        formatter={(v) => formatCurrency(v, settings, { locale })}
      />
      <DataTablePageCard
        label="Total Spent (Current Month)"
        value={totalSpent}
        isLoading={isLoading}
        formatter={(v) => formatCurrency(v, settings, { locale })}
      />
      <DataTablePageCard
        label="Overall Usage"
        value={Math.round(usagePercent)}
        isLoading={isLoading}
        formatter={(v) => `${Math.round(v)}%`}
        valueClassName={usageColor}
      />
    </div>
  );
}
