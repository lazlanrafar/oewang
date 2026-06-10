"use client";

import type { TransactionSettings } from "@workspace/types";
import { DataTablePageCard } from "@workspace/ui";
import { formatCurrency } from "@workspace/utils";

interface DebtsClientCardsProps {
  totalReceivable: number;
  totalPayable: number;
  netPosition: number;
  overdueCount: number;
  isLoading: boolean;
  settings: TransactionSettings | null;
  locale: string;
}

export function DebtsClientCards({
  totalReceivable,
  totalPayable,
  netPosition,
  overdueCount,
  isLoading,
  settings,
  locale,
}: DebtsClientCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <DataTablePageCard
        label="Owed to You"
        value={totalReceivable}
        isLoading={isLoading}
        formatter={(v) => formatCurrency(v, settings, { locale })}
        valueClassName="text-emerald-600 dark:text-emerald-400"
      />
      <DataTablePageCard
        label="You Owe"
        value={totalPayable}
        isLoading={isLoading}
        formatter={(v) => formatCurrency(v, settings, { locale })}
        valueClassName="text-rose-600 dark:text-rose-400"
      />
      <DataTablePageCard
        label="Net Position"
        value={netPosition}
        isLoading={isLoading}
        formatter={(v) => formatCurrency(v, settings, { locale })}
        valueClassName={
          netPosition > 0
            ? "text-emerald-600 dark:text-emerald-400"
            : netPosition < 0
              ? "text-rose-600 dark:text-rose-400"
              : undefined
        }
      />
      <DataTablePageCard
        label="Overdue"
        value={overdueCount}
        isLoading={isLoading}
        valueClassName={overdueCount > 0 ? "text-rose-600 dark:text-rose-400" : undefined}
      />
    </div>
  );
}
