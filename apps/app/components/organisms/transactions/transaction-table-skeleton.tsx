"use client";

import { TableSkeleton } from "@workspace/ui";
import { transactionColumns } from "./transaction-columns";
import { useAppStore } from "@/stores/app";

export function TransactionTableSkeleton({ hideHeader = false }: { hideHeader?: boolean }) {
  const { dictionary, formatCurrency, getTransactionColor } = useAppStore();

  if (!dictionary) return null;

  const columns = transactionColumns(() => {}, dictionary, formatCurrency, getTransactionColor);

  return (
    <div className="flex w-full flex-col h-full space-y-4">
      {/* Skeleton for Header (Search and Actions) */}
      {!hideHeader && (
        <div className="flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center flex-1 max-w-sm h-10 bg-muted/30 animate-pulse rounded-md" />
          <div className="flex items-center gap-2">
            <div className="w-24 h-9 bg-muted/30 animate-pulse rounded-md" />
            <div className="w-24 h-9 bg-muted/30 animate-pulse rounded-md" />
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        <TableSkeleton
          columns={columns as any}
          rowCount={20}
          stickyColumnIds={["select", "date", "name", "actions"]}
          actionsColumnId="actions"
        />
      </div>
    </div>
  );
}
