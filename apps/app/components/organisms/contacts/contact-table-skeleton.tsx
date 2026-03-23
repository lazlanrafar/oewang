"use client";

import { TableSkeleton, Skeleton } from "@workspace/ui";
import { getContactColumns } from "./contact-columns";
import { useAppStore } from "@/stores/app";

export function ContactTableSkeleton() {
  const { dictionary } = useAppStore();

  if (!dictionary) return null;

  const columns = getContactColumns(() => {}, dictionary);

  return (
    <div className="flex w-full flex-col h-full space-y-4">
      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-6 flex flex-col gap-1 border border-border bg-muted/5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Total Contacts
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight mt-1">
            <Skeleton className="h-9 w-12" />
          </span>
        </div>

        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Added This Month
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight mt-1">
            <Skeleton className="h-9 w-12" />
          </span>
        </div>

        <div className="p-6 flex flex-col gap-1 border border-border bg-muted/5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Most Active Client
          </span>
          <span className="text-lg font-serif font-medium tracking-tight mt-1">
            <Skeleton className="h-7 w-32" />
          </span>
          <span className="text-[10px] text-muted-foreground mt-1">
            <Skeleton className="h-3 w-24" />
          </span>
        </div>

        <div className="p-6 flex flex-col gap-1 border border-border bg-muted/5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Top Revenue Client
          </span>
          <span className="text-lg font-serif font-medium tracking-tight mt-1">
            <Skeleton className="h-7 w-32" />
          </span>
          <span className="text-[10px] text-muted-foreground mt-1">
            <Skeleton className="h-3 w-24" />
          </span>
        </div>
      </div>

      {/* Toolbar Skeleton */}
      <div className="flex items-center justify-between gap-4 shrink-0 px-1">
        <div className="flex items-center flex-1 max-sm h-10 bg-muted/30 animate-pulse rounded-md" />
        <div className="flex items-center gap-2">
          <div className="w-10 h-9 bg-muted/30 animate-pulse rounded-md" />
          <div className="w-32 h-9 bg-muted/30 animate-pulse rounded-md" />
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <TableSkeleton
          columns={columns as any}
          rowCount={10}
          actionsColumnId="actions"
        />
      </div>
    </div>
  );
}
