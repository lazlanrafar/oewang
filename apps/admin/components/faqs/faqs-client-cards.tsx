"use client";

import type { FaqStats } from "@workspace/types";
import { DataTablePageCard } from "@workspace/ui";

interface FaqsClientCardsProps {
  stats: FaqStats;
  isLoading: boolean;
}

export function FaqsClientCards({ stats, isLoading }: FaqsClientCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <DataTablePageCard label="Total FAQs" value={stats.total} isLoading={isLoading} />
      <DataTablePageCard
        label="Published"
        value={stats.published}
        isLoading={isLoading}
        valueClassName="text-emerald-600 dark:text-emerald-400"
      />
      <DataTablePageCard
        label="Draft"
        value={stats.draft}
        isLoading={isLoading}
        valueClassName="text-slate-600 dark:text-slate-300"
      />
    </div>
  );
}
