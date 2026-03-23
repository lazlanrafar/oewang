import { TableSkeleton } from "@workspace/ui";
import { debtColumns } from "./debts-columns";

export function DebtTableSkeleton() {
  const columns = debtColumns(
    () => {},
    () => {},
    () => {},
    () => {},
  );

  return (
    <div className="flex w-full flex-col h-full space-y-4">
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
          stickyColumnIds={["select", "contactName"]}
          actionsColumnId="actions"
        />
      </div>
    </div>
  );
}
