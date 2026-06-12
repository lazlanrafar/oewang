"use client";

import type { SystemAdminWorkspaceStats } from "@workspace/types";
import { DataTablePageCard } from "@workspace/ui";

interface WorkspacesClientCardsProps {
  stats: SystemAdminWorkspaceStats;
  isLoading: boolean;
}

export function WorkspacesClientCards({
  stats,
  isLoading,
}: WorkspacesClientCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <DataTablePageCard
        label="Total Workspaces"
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
        label="Paid"
        value={stats.paid}
        isLoading={isLoading}
        valueClassName="text-amber-600 dark:text-amber-400"
      />
      <DataTablePageCard
        label="Free"
        value={stats.free}
        isLoading={isLoading}
        valueClassName="text-slate-600 dark:text-slate-300"
      />
    </div>
  );
}
