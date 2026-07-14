"use client";

import type { ArticleStats } from "@workspace/types";
import { DataTablePageCard } from "@workspace/ui";

interface ArticlesClientCardsProps {
  stats: ArticleStats;
  isLoading: boolean;
}

export function ArticlesClientCards({ stats, isLoading }: ArticlesClientCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <DataTablePageCard label="Total Articles" value={stats.total} isLoading={isLoading} />
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
