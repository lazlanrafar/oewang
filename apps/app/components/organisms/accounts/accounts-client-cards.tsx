"use client";

import type { Dictionary } from "@workspace/dictionaries";
import { DataTablePageCard } from "@workspace/ui";

interface AccountsClientCardsProps {
  totalBalance: number;
  accountCount: number;
  activeAccounts: number;
  isLoading: boolean;
  formatCurrency: (v: number, opts?: { locale?: string }) => string;
  locale: string;
  dictionary: Dictionary;
}

export function AccountsClientCards({
  totalBalance,
  accountCount,
  activeAccounts,
  isLoading,
  formatCurrency,
  locale,
  dictionary,
}: AccountsClientCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <DataTablePageCard
        label={dictionary.accounts.total_balance}
        value={totalBalance}
        isLoading={isLoading}
        formatter={(v) => formatCurrency(v, { locale })}
      />
      <DataTablePageCard
        label={dictionary.accounts.title}
        value={accountCount}
        isLoading={isLoading}
      />
      <DataTablePageCard
        label={dictionary.accounts.active}
        value={activeAccounts}
        isLoading={isLoading}
        valueClassName="text-emerald-600 dark:text-emerald-400"
      />
    </div>
  );
}
