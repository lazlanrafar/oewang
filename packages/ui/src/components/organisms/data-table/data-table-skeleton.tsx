"use client";

import type {
  ColumnDef,
  ColumnSizingState,
  VisibilityState,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { useStickyColumns } from "../../../hooks/use-sticky-columns";
import { cn } from "../../../lib/utils";
import { Skeleton } from "../../atoms/skeleton";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "../../atoms/table";
import { SkeletonCell } from "./data-table-skeleton-cell";
import {
  getColumnId,
  getHeaderLabel,
  type TableColumnMeta,
} from "./data-table-types";

interface TableSkeletonProps<TData> {
  /** Column definitions with skeleton config in meta */
  columns: ColumnDef<TData>[];
  /** Number of skeleton rows to render */
  rowCount?: number;
  /** Column visibility state */
  columnVisibility?: VisibilityState;
  /** Column sizing state */
  columnSizing?: ColumnSizingState;
  /** Column order array */
  columnOrder?: string[];
  /** IDs of sticky columns (left-aligned) */
  stickyColumnIds?: string[];
  /** ID of the actions column (right-aligned sticky) */
  actionsColumnId?: string;
  /** Render in empty state (blurred) */
  isEmpty?: boolean;
  /** Additional className for the container */
  className?: string;
}

export function TableSkeleton<TData>({
  columns,
  rowCount = 40,
  columnVisibility = {},
  columnSizing = {},
  columnOrder = [],
  stickyColumnIds = [],
  actionsColumnId = "actions",
  isEmpty = false,
  className,
}: TableSkeletonProps<TData>) {
  const rows = useMemo(
    () => [...Array(rowCount)].map((_, i) => ({ id: i.toString() })),
    [rowCount],
  );

  const orderedColumns = useMemo(() => {
    if (columnOrder.length > 0) {
      const ordered = columnOrder
        .map((id) => columns.find((c) => getColumnId(c) === id))
        .filter(Boolean) as typeof columns;
      const orderedIds = new Set(columnOrder);
      const remaining = columns.filter((c) => !orderedIds.has(getColumnId(c)));
      return [...ordered, ...remaining];
    }
    return columns;
  }, [columns, columnOrder]);

  const visibleColumns = useMemo(() => {
    return orderedColumns.filter((col) => {
      const id = getColumnId(col);
      if (id === "select" || id === actionsColumnId) return true;
      return columnVisibility[id] !== false;
    });
  }, [orderedColumns, columnVisibility, actionsColumnId]);

  const { getStickyStyle, getStickyClassName } = useStickyColumns({
    columnVisibility,
    loading: true,
  });

  const isSticky = (columnId: string) => stickyColumnIds.includes(columnId);

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "overflow-auto overscroll-x-none scrollbar-hide",
          !isEmpty && "md:border-l md:border-r md:border-b md:border-border",
        )}
      >
        <div
          style={{ minWidth: "100%", width: "max-content" }}
          className={cn(isEmpty && "opacity-20 pointer-events-none blur-[7px]")}
        >
          {/* Header — uses real table elements for semantic correctness */}
          <Table className="w-full block border-none">
            <TableHeader className="border-0 block sticky top-0 z-20 bg-background">
              <TableRow className="h-[45px] hover:bg-transparent flex items-center border-b-0!">
                {visibleColumns.map((col) => {
                  const columnId = getColumnId(col);
                  const meta = col.meta as TableColumnMeta | undefined;
                  const sticky = isSticky(columnId);
                  const isActions = columnId === actionsColumnId;
                  const isStatus = columnId === "status";

                  const width = columnSizing[columnId] ?? col.size ?? 150;
                  const minWidth = sticky ? width : (col.minSize ?? width);
                  const maxWidth = sticky ? width : (col.maxSize ?? width);

                  const stickyClass = getStickyClassName(
                    columnId,
                    "group/header relative h-full px-4 border-t border-border flex items-center",
                  );
                  const headerClassName = isActions
                    ? "group/header relative h-full px-4 border-t border-border flex items-center justify-center md:sticky md:right-0 bg-background z-10"
                    : sticky
                      ? `${stickyClass} bg-background z-10`
                      : stickyClass;

                  return (
                    <TableHead
                      key={columnId}
                      className={headerClassName}
                      style={{
                        width,
                        minWidth,
                        maxWidth,
                        ...getStickyStyle(columnId),
                        ...(!isActions && !isStatus && {
                          borderRight: "1px solid hsl(var(--border))",
                        }),
                        ...(isActions && {
                          borderLeft: "1px solid hsl(var(--border))",
                          borderTop: "1px solid hsl(var(--border))",
                        }),
                      }}
                    >
                      {columnId === "select" ? (
                        <Skeleton className="h-4 w-4" />
                      ) : meta?.skeleton?.type === "text" && columnId === "description" ? (
                        <div className="flex items-center justify-between w-full overflow-hidden">
                          <div className="min-w-0 overflow-hidden">
                            <span className="text-muted-foreground">{getHeaderLabel(col)}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{getHeaderLabel(col)}</span>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
          </Table>

          {/* Body — plain divs avoid all table layout / display conflicts */}
          <div>
            {rows.map((row) => (
              <div
                key={row.id}
                style={{ height: 45 }}
                className="flex items-center border-b border-border"
              >
                {visibleColumns.map((col) => {
                  const columnId = getColumnId(col);
                  const meta = col.meta as TableColumnMeta | undefined;
                  const sticky = isSticky(columnId);
                  const isActions = columnId === actionsColumnId;

                  const width = columnSizing[columnId] ?? col.size ?? 150;
                  const minWidth = sticky ? width : (col.minSize ?? width);
                  const maxWidth = sticky ? width : (col.maxSize ?? width);

                  const cellClassName = cn(
                    "h-full flex items-center px-4 shrink-0",
                    getStickyClassName(columnId, meta?.className),
                    isActions && "md:sticky md:right-0 bg-background z-10 justify-center",
                  );

                  return (
                    <div
                      key={columnId}
                      className={cellClassName}
                      style={{
                        width,
                        minWidth,
                        maxWidth,
                        ...getStickyStyle(columnId),
                        ...(isActions && {
                          borderLeft: "1px solid hsl(var(--border))",
                        }),
                      }}
                    >
                      {meta?.skeleton ? (
                        <SkeletonCell type={meta.skeleton.type} width={meta.skeleton.width} />
                      ) : (
                        <Skeleton className="h-3.5 w-24" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
