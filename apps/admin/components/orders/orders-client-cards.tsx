"use client";

import type { AdminOrderStats } from "@workspace/types";
import { DataTablePageCard } from "@workspace/ui";

interface OrdersClientCardsProps {
  stats: AdminOrderStats;
  isLoading: boolean;
}

export function OrdersClientCards({
  stats,
  isLoading,
}: OrdersClientCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <DataTablePageCard
        label="Total Orders"
        value={stats.total}
        isLoading={isLoading}
      />
      <DataTablePageCard
        label="Paid"
        value={stats.paid}
        isLoading={isLoading}
        valueClassName="text-emerald-600 dark:text-emerald-400"
      />
      <DataTablePageCard
        label="Pending"
        value={stats.pending}
        isLoading={isLoading}
        valueClassName="text-amber-600 dark:text-amber-400"
      />
      <DataTablePageCard
        label="Failed / Canceled"
        value={stats.failed}
        isLoading={isLoading}
        valueClassName="text-red-600 dark:text-red-400"
      />
    </div>
  );
}
