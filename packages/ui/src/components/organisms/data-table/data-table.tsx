"use client";

import { useSortParams } from "../../../hooks/use-sort-params";
import { useStickyColumns } from "../../../hooks/use-sticky-columns";
import { useTableDnd } from "../../../hooks/use-table-dnd";
import { useTableScroll } from "../../../hooks/use-table-scroll";
import { useTableSettings } from "../../../hooks/use-table-settings";
import { cn } from "../../../lib/utils";

import { DataTableRow } from "./data-table-row";
import { TableId, type TableSettings } from "./data-table-settings";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  Column,
  ColumnDef,
  PaginationState,
  RowSelectionState,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataTableHeader } from "./data-table-header";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Table,
  TableBody,
  Tooltip,
  TooltipProvider,
} from "../../atoms";
import { ROW_HEIGHTS } from "./data-table-configs";

// Stable reference for non-clickable columns
const DEFAULT_NON_CLICKABLE_COLUMNS = new Set(["select", "actions"]);

type StickyConfig = {
  /** Column IDs that should be sticky. Order matters — they stack left-to-right. */
  columns: string[];
  /** How many leading columns to skip when computing scroll offsets. */
  startFromColumn?: number;
};

type DataTableMeta<TData> = {
  /** Called when a clickable cell row is clicked */
  onRowClick?: (row: TData) => void;
  /** Called when copy URL is triggered */
  onCopyUrl?: (id: string) => void;
};

type Props<TData extends { id: string | number }> = {
  data: TData[];
  columns: ColumnDef<TData>[];
  setColumns: (columns: Column<any, unknown>[]) => void;
  tableId: TableId;
  initialSettings?: Partial<TableSettings>;
  /** Columns that should not trigger row-click. Defaults to ["select", "actions"]. */
  nonClickableColumns?: Set<string>;
  /** Configure sticky columns. If omitted, no columns are sticky. */
  sticky?: StickyConfig;
  /** Additional meta passed through to cell renderers via `table.options.meta`. */
  meta?: DataTableMeta<TData>;
  /** Number of rows per page. Default: 20 */
  pageSize?: number;
  /** Height of the scrollable table body. Default: calc(100svh - 210px) */
  containerHeight?: string;
  /** Message shown when data is empty. Default: "No results" */
  emptyMessage?: string;
  /** Whether pagination is handled externally (server-side). */
  manualPagination?: boolean;
  /** Total number of pages (required if manualPagination is true). */
  pageCount?: number;
  /** Current pagination state (required if manualPagination is true). */
  pagination?: PaginationState;
  /** Callback for pagination changes (required if manualPagination is true). */
  onPaginationChange?: (
    updater: import("@tanstack/react-table").Updater<PaginationState>,
  ) => void;
  /** Total number of records (used for display in footer). */
  rowCount?: number;
  /** Whether the table should fill its container's height. If true, containerHeight is ignored. */
  hFull?: boolean;
};

export function DataTable<TData extends { id: string | number }>({
  data,
  columns,
  setColumns,
  tableId,
  initialSettings,
  nonClickableColumns = DEFAULT_NON_CLICKABLE_COLUMNS,
  sticky,
  meta,
  pageSize: pageSizeProp = 20,
  containerHeight = "calc(100svh - 210px)",
  emptyMessage = "No results",
  manualPagination,
  pageCount: pageCountProp,
  pagination: paginationProp,
  onPaginationChange,
  rowCount,
  hFull,
}: Props<TData>) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const {
    columnVisibility,
    setColumnVisibility,
    columnSizing,
    setColumnSizing,
    columnOrder,
    setColumnOrder,
  } = useTableSettings({ tableId, initialSettings });

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSizeProp,
  });

  // Stable meta callbacks
  const handleShiftClickRangeRef = useRef<
    (startIndex: number, endIndex: number) => void
  >(() => {});

  const handleShiftClickRange = useCallback(
    (startIndex: number, endIndex: number) =>
      handleShiftClickRangeRef.current(startIndex, endIndex),
    [],
  );

  const tableMeta = useMemo(
    () => ({
      onRowClick: meta?.onRowClick,
      onCopyUrl: meta?.onCopyUrl,
      handleShiftClickRange,
    }),
    [meta?.onRowClick, meta?.onCopyUrl, handleShiftClickRange],
  );

  const table = useReactTable({
    getRowId: (row) => String(row.id),
    data,
    columns,
    state: {
      columnVisibility,
      columnSizing,
      columnOrder,
      rowSelection,
      pagination: paginationProp ?? pagination,
    },
    manualPagination,
    pageCount: pageCountProp,
    onPaginationChange: onPaginationChange ?? setPagination,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: manualPagination
      ? undefined
      : getPaginationRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    meta: tableMeta,
  });

  const { sensors, handleDragEnd } = useTableDnd(table);

  handleShiftClickRangeRef.current = useCallback(
    (startIndex: number, endIndex: number) => {
      const rows = table.getRowModel().rows;
      const start = Math.min(startIndex, endIndex);
      const end = Math.max(startIndex, endIndex);
      const allSelected = Array.from({ length: end - start + 1 }, (_, i) => {
        const row = rows[start + i];
        return row ? rowSelection[row.id] : true;
      }).every(Boolean);
      setRowSelection((prev) => {
        const next = { ...prev };
        for (let i = start; i <= end; i++) {
          const row = rows[i];
          if (!row) continue;
          if (allSelected) delete next[row.id];
          else next[row.id] = true;
        }
        return next;
      });
    },
    [table, rowSelection],
  );

  const { getStickyStyle, getStickyClassName } = useStickyColumns({
    columnVisibility,
    table,
    stickyColumns: sticky?.columns,
    tableId,
  });

  const tableScroll = useTableScroll({
    useColumnWidths: !!sticky,
    startFromColumn: sticky?.startFromColumn ?? 0,
  });

  useEffect(() => {
    setColumns?.([...table.getAllLeafColumns()]);
  }, [columnVisibility, setColumns, table]);

  const handleCellClick = useCallback(
    (rowId: string) => {
      const row = data.find((d) => String(d.id) === rowId);
      if (row) meta?.onRowClick?.(row);
    },
    [data, meta],
  );

  const rowHeight = ROW_HEIGHTS[tableId] ?? 45;
  const currentRows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const totalCount = rowCount ?? data.length;

  // Build page links with ellipsis — show up to 5 pages around current
  const buildPageLinks = () => {
    const pages: (number | "ellipsis")[] = [];
    if (pageCount <= 7) {
      for (let i = 0; i < pageCount; i++) pages.push(i);
    } else {
      pages.push(0);
      if (pageIndex > 3) pages.push("ellipsis");
      const start = Math.max(1, pageIndex - 1);
      const end = Math.min(pageCount - 2, pageIndex + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (pageIndex < pageCount - 4) pages.push("ellipsis");
      pages.push(pageCount - 1);
    }
    return pages;
  };

  if (!data.length) {
    return (
      <div className="relative overflow-hidden flex items-center justify-center py-20">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative",
        hFull && "flex flex-col h-full overflow-hidden",
      )}
    >
      <TooltipProvider delayDuration={20}>
        <Tooltip>
          <div
            className={cn("w-full", hFull && "flex-1 flex flex-col min-h-0")}
          >
            <div
              ref={(el) => {
                scrollContainerRef.current = el;
                (
                  tableScroll.containerRef as React.MutableRefObject<HTMLDivElement | null>
                ).current = el;
              }}
              className={cn(
                "overflow-auto overscroll-none border-l border-r border-b border-border scrollbar-hide",
                hFull ? "flex-1" : "",
              )}
              style={hFull ? {} : { height: containerHeight }}
            >
              {/* Block div carries minWidth so overflow:auto clips correctly.
                  Native <table> elements (display:table) can escape overflow:auto —
                  block divs cannot. Sidebar-state-agnostic — no magic numbers needed. */}
              <div style={{ minWidth: table.getTotalSize() }}>
                <DndContext
                  id={`${tableId}-table-dnd`}
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <Table className="w-full">
                    <DataTableHeader
                      table={table}
                      tableScroll={tableScroll}
                      tableId={tableId}
                    />

                    <TableBody className="border-l-0 border-r-0 block">
                      {currentRows.map((row) => (
                        <DataTableRow
                          key={row.id}
                          row={row}
                          rowHeight={rowHeight}
                          getStickyStyle={getStickyStyle}
                          getStickyClassName={getStickyClassName}
                          nonClickableColumns={nonClickableColumns}
                          onCellClick={handleCellClick}
                          columnSizing={columnSizing}
                          columnOrder={columnOrder}
                          columnVisibility={columnVisibility}
                          isSelected={!!rowSelection[row.id]}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </DndContext>
              </div>
            </div>
          </div>
        </Tooltip>
      </TooltipProvider>

      {/* Pagination summary and controls */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-1 py-4">
          <p className="text-sm text-muted-foreground">
            Page{" "}
            <span className="font-medium text-foreground">{pageIndex + 1}</span>{" "}
            of <span className="font-medium text-foreground">{pageCount}</span>
            {" · "}
            <span className="font-medium text-foreground">
              {totalCount}
            </span>{" "}
            total
          </p>

          {pageCount > 1 && (
            <Pagination className="w-auto mx-0">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => table.previousPage()}
                    aria-disabled={!table.getCanPreviousPage()}
                    className={
                      !table.getCanPreviousPage()
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>

                {buildPageLinks().map((page, i) =>
                  page === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={page}>
                      <PaginationLink
                        isActive={page === pageIndex}
                        onClick={() => table.setPageIndex(page)}
                        className="cursor-pointer"
                      >
                        {page + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}

                <PaginationItem>
                  <PaginationNext
                    onClick={() => table.nextPage()}
                    aria-disabled={!table.getCanNextPage()}
                    className={
                      !table.getCanNextPage()
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}
    </div>
  );
}
