"use client";

import type { PricingStats } from "@workspace/types";
import { DataTablePageCard } from "@workspace/ui";

interface PricingClientCardsProps {
  stats: PricingStats;
  isLoading: boolean;
}

export function PricingClientCards({
  stats,
  isLoading,
}: PricingClientCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <DataTablePageCard
        label="Total Plans"
        value={stats.total}
        isLoading={isLoading}
      />
      <DataTablePageCard
        label="Active"
        value={stats.active}
        isLoading={isLoading}
        valueClassName="text-emerald-600 dark:text-emerald-400"
      />
      <DataTablePageCard
        label="Inactive"
        value={stats.inactive}
        isLoading={isLoading}
        valueClassName="text-slate-600 dark:text-slate-300"
      />
      <DataTablePageCard
        label="Add-ons"
        value={stats.addons}
        isLoading={isLoading}
        valueClassName="text-blue-600 dark:text-blue-400"
      />
    </div>
  );
}
