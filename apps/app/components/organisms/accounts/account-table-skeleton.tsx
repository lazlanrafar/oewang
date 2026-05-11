"use client";

import { Skeleton, TableSkeleton } from "@workspace/ui";

export function AccountTableSkeleton() {
  const columns = [
    { id: "name", header: "Account" },
    { id: "type", header: "Type" },
    { id: "currency", header: "Currency" },
    { id: "balance", header: "Balance" },
    { id: "actions", header: "" },
  ];

  return (
    <div className="flex h-full w-full flex-col space-y-4">
      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1 border border-border p-6">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            Total Balance
          </span>
          <span className="mt-1 font-medium font-serif text-3xl tracking-tight">
            <Skeleton className="h-9 w-32" />
          </span>
        </div>
        <div className="flex flex-col gap-1 border border-border p-6">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Accounts</span>
          <span className="mt-1 font-medium font-serif text-3xl tracking-tight">
            <Skeleton className="h-9 w-12" />
          </span>
        </div>
        <div className="flex flex-col gap-1 border border-border p-6">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Active</span>
          <span className="mt-1 font-medium font-serif text-3xl tracking-tight">
            <Skeleton className="h-9 w-12" />
          </span>
        </div>
      </div>

      {/* Toolbar Skeleton */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-1">
        <div className="flex h-10 max-w-sm flex-1 animate-pulse items-center rounded-md bg-muted/30" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-10 animate-pulse rounded-md bg-muted/30" />
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted/30" />
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <TableSkeleton columns={columns} rowCount={10} stickyColumnIds={["name"]} actionsColumnId="actions" />
      </div>
    </div>
  );
}
