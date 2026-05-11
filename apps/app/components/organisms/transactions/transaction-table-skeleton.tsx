"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Skeleton, TableSkeleton } from "@workspace/ui";

export function TransactionTableSkeleton({
  hideHeader = false,
}: {
  hideHeader?: boolean;
}) {
  const columns: ColumnDef<Record<string, string>>[] = [
    { id: "select", header: "" },
    { id: "date", header: "Date" },
    { id: "type", header: "Type" },
    { id: "category", header: "Category" },
    { id: "name", header: "Name" },
    { id: "amount", header: "Amount" },
    { id: "wallet", header: "Wallet" },
    { id: "actions", header: "" },
  ];

  return (
    <div className="flex h-full w-full flex-col space-y-4">
      {/* Skeleton toolbar — mirrors the actual transaction page header */}
      {!hideHeader && (
        <div className="flex shrink-0 items-center justify-between gap-3">
          {/* Left: search + filter icon */}
          <div className="flex flex-1 items-center gap-2">
            <Skeleton className="h-9 max-w-sm flex-1" />
          </div>
          {/* Right: grouping selector + date range + columns + backup + add */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-[110px]" />
            <Skeleton className="h-9 w-[180px]" />
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-[100px]" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <TableSkeleton
          columns={columns}
          rowCount={20}
          stickyColumnIds={["select", "date", "name", "actions"]}
          actionsColumnId="actions"
        />
      </div>
    </div>
  );
}
