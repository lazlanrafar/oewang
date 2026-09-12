"use client";

import type { FeedbackStats } from "@workspace/types";
import { DataTablePageCard } from "@workspace/ui";

interface FeedbackClientCardsProps {
  stats: FeedbackStats;
  isLoading: boolean;
}

export function FeedbackClientCards({ stats, isLoading }: FeedbackClientCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <DataTablePageCard label="Total" value={stats.total} isLoading={isLoading} />
      <DataTablePageCard
        label="New"
        value={stats.new}
        isLoading={isLoading}
        valueClassName="text-slate-600 dark:text-slate-300"
      />
      <DataTablePageCard
        label="In Review"
        value={stats.in_review}
        isLoading={isLoading}
        valueClassName="text-blue-600 dark:text-blue-400"
      />
      <DataTablePageCard
        label="Resolved"
        value={stats.resolved}
        isLoading={isLoading}
        valueClassName="text-emerald-600 dark:text-emerald-400"
      />
    </div>
  );
}
