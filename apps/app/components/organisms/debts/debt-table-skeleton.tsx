"use client";

import { TableSkeleton } from "@workspace/ui";

export function DebtTableSkeleton() {
  const columns = [
    { id: "select", header: "" },
    { id: "type", header: "Type" },
    { id: "contactName", header: "Contact" },
    { id: "description", header: "Description" },
    { id: "amount", header: "Amount" },
    { id: "status", header: "Status" },
    { id: "dueDate", header: "Due Date" },
    { id: "actions", header: "" },
  ];

  return (
    <div className="flex h-full w-full flex-col space-y-4">
      {/* Toolbar Skeleton */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-1">
        <div className="flex h-10 max-w-sm flex-1 animate-pulse items-center rounded-md bg-muted/30" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-10 animate-pulse rounded-md bg-muted/30" />
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted/30" />
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <TableSkeleton
          columns={columns}
          rowCount={10}
          stickyColumnIds={["select", "contactName"]}
          actionsColumnId="actions"
        />
      </div>
    </div>
  );
}
