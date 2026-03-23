"use client";

import { TableSkeleton, Skeleton } from "@workspace/ui";
import { accountColumns } from "./account-columns";

export function AccountTableSkeleton() {
  const columns = accountColumns(() => {}, () => {});

  return (
    <div className="flex w-full flex-col h-full space-y-4">
      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Total Balance
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight mt-1">
            <Skeleton className="h-9 w-32" />
          </span>
        </div>
        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Accounts
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight mt-1">
            <Skeleton className="h-9 w-12" />
          </span>
        </div>
        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Active
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight mt-1">
            <Skeleton className="h-9 w-12" />
          </span>
        </div>
      </div>

      {/* Toolbar Skeleton */}
      <div className="flex items-center justify-between gap-4 shrink-0 px-1">
        <div className="flex items-center flex-1 max-w-sm h-10 bg-muted/30 animate-pulse rounded-md" />
        <div className="flex items-center gap-2">
          <div className="w-10 h-9 bg-muted/30 animate-pulse rounded-md" />
          <div className="w-32 h-9 bg-muted/30 animate-pulse rounded-md" />
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <TableSkeleton
          columns={columns as any}
          rowCount={10}
          stickyColumnIds={["name"]}
          actionsColumnId="actions"
        />
      </div>
    </div>
  );
}
