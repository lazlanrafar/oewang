"use client";

import type { SystemAdminUserStats } from "@workspace/types";
import { DataTablePageCard } from "@workspace/ui";

interface UsersClientCardsProps {
  stats: SystemAdminUserStats;
  isLoading: boolean;
}

export function UsersClientCards({
  stats,
  isLoading,
}: UsersClientCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <DataTablePageCard
        label="Total Users"
        value={stats.total}
        isLoading={isLoading}
      />
      <DataTablePageCard
        label="Owners"
        value={stats.owners}
        isLoading={isLoading}
        valueClassName="text-violet-600 dark:text-violet-400"
      />
      <DataTablePageCard
        label="Finance"
        value={stats.finance}
        isLoading={isLoading}
        valueClassName="text-blue-600 dark:text-blue-400"
      />
      <DataTablePageCard
        label="Users"
        value={stats.users}
        isLoading={isLoading}
        valueClassName="text-slate-600 dark:text-slate-300"
      />
    </div>
  );
}
