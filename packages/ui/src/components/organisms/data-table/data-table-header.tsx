"use client";

import {
  NON_REORDERABLE_COLUMNS,
  SORT_FIELD_MAPS,
  STICKY_COLUMNS,
} from "./data-table-configs";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Header, Table } from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo } from "react";
import {
  Button,
  Checkbox,
  TableHead,
  TableHeader,
  TableRow,
} from "../../atoms";
import { HorizontalPagination } from "../../molecules";
import { TableId } from "./data-table-settings";
import {
  ACTIONS_FULL_WIDTH_HEADER_CLASS,
  ACTIONS_STICKY_HEADER_CLASS,
  getHeaderLabel,
  TableScrollState,
} from "./data-table-types";
import type { StickyConfig } from "./data-table";
import { useStickyColumns } from "../../../hooks/use-sticky-columns";
import { useSortQuery } from "../../../hooks/use-sort-query";
import { DataTableResizeHandle } from "./data-table-resize-handle";
import { DataTableHeaderDraggable } from "./data-table-header-draggable";

interface Props<TData> {
  table?: Table<TData>;
  loading?: boolean;
  tableScroll?: TableScrollState;
  tableId: TableId;
  sticky?: StickyConfig;
}

export function DataTableHeader<TData>({
  table,
  loading,
  tableScroll,
  tableId,
  sticky,
}: Props<TData>) {
  const { sortColumn, sortValue, createSortQuery } = useSortQuery();

  // Use the reusable sticky columns hook
  const { getStickyStyle, getStickyClassName, isVisible } = useStickyColumns({
    table,
    loading,
    tableId,
    stickyColumns: sticky?.columns,
  });

  // Get sortable column IDs (excluding sticky columns)
  const sortableColumnIds = useMemo(() => {
    if (!table) return [];
    return table
      .getAllLeafColumns()
      .filter((col) => !NON_REORDERABLE_COLUMNS[tableId].has(col.id))
      .map((col) => col.id);
  }, [table, tableId]);

  // Find the index of the last visible non-sticky non-actions column
  const lastNonStickyHeaderIndex = useMemo(() => {
    if (!table) return -1;
    const visibleHeaders = table.getHeaderGroups()[0]?.headers ?? [];
    for (let i = visibleHeaders.length - 1; i >= 0; i--) {
      const h = visibleHeaders[i];
      if (!h) continue;
      if (h.column.id === "actions") continue;
      const m = h.column.columnDef.meta as { sticky?: boolean } | undefined;
      if (!m?.sticky && isVisible(h.column.id)) return i;
    }
    return -1;
  }, [table, isVisible]);

  // The last sticky column gets the horizontal pagination arrows
  const lastStickyColumnId = useMemo(() => {
    const stickyCols = STICKY_COLUMNS[tableId];
    // Walk backwards to find the last sticky column that's actually visible
    for (let i = stickyCols.length - 1; i >= 0; i--) {
      const col = stickyCols[i];
      if (col && isVisible(col.id)) return col.id;
    }
    return null;
  }, [tableId, isVisible]);

  if (!table) return null;

  const headerGroups = table.getHeaderGroups();

  return (
    <TableHeader className="border-0 block sticky top-0 z-20 bg-background w-full">
      {headerGroups.map((headerGroup) => (
        <TableRow
          key={headerGroup.id}
          className="h-[45px] hover:bg-transparent flex items-center border-b-0! min-w-full"
        >
          <SortableContext
            items={sortableColumnIds}
            strategy={horizontalListSortingStrategy}
          >
            {headerGroup.headers.map((header, headerIndex, headers) => {
              const columnId = header.column.id;
              const meta = header.column.columnDef.meta as
                | { sticky?: boolean; className?: string }
                | undefined;
              const isSticky = meta?.sticky;
              const canReorder =
                !NON_REORDERABLE_COLUMNS[tableId].has(columnId);
              const isActions = columnId === "actions";

              if (!isVisible(columnId)) return null;

              // Check if actions should be full width (no non-sticky visible columns)
              const hasNonStickyVisible = headers.some((h) => {
                if (h.column.id === "actions") return false;
                if (!isVisible(h.column.id)) return false;
                const hMeta = h.column.columnDef.meta as
                  | { sticky?: boolean }
                  | undefined;
                return !hMeta?.sticky;
              });
              const actionsFullWidth = isActions && !hasNonStickyVisible;

              // Check if this column should flex (last before actions, or full-width actions, or true last non-sticky)
              const isLastBeforeActions =
                headerIndex === headers.length - 2 &&
                headers[headers.length - 1]?.column.id === "actions";
              const isLastNonSticky = headerIndex === lastNonStickyHeaderIndex;
              const shouldFlex =
                isLastNonSticky ||
                (isLastBeforeActions && !isSticky) ||
                actionsFullWidth;

              const headerStyle = {
                width:
                  actionsFullWidth || shouldFlex ? undefined : header.getSize(),
                minWidth: actionsFullWidth
                  ? undefined
                  : isSticky
                    ? header.getSize()
                    : header.column.columnDef.minSize,
                maxWidth: actionsFullWidth
                  ? undefined
                  : isSticky
                    ? header.getSize()
                    : header.column.columnDef.maxSize,
                flexShrink: shouldFlex ? 1 : 0,
                ...(!actionsFullWidth && getStickyStyle(columnId)),
                ...(shouldFlex && { flex: 1 }),
              };

              // Non-reorderable columns (sticky + actions)
              if (!canReorder) {
                const stickyClass = getStickyClassName(
                  columnId,
                  "group/header relative h-full px-4 border-t border-border flex items-center",
                );
                const finalClassName = isActions
                  ? actionsFullWidth
                    ? ACTIONS_FULL_WIDTH_HEADER_CLASS
                    : ACTIONS_STICKY_HEADER_CLASS
                  : `${stickyClass} bg-background z-20`;

                return (
                  <TableHead
                    key={header.id}
                    className={finalClassName}
                    style={headerStyle}
                  >
                    {renderHeaderContent(
                      header,
                      columnId,
                      sortColumn,
                      sortValue,
                      createSortQuery,
                      table,
                      tableId,
                      tableScroll,
                      lastStickyColumnId,
                    )}
                    <DataTableResizeHandle header={header} />
                  </TableHead>
                );
              }

              // Draggable columns
              return (
                <DataTableHeaderDraggable
                  key={header.id}
                  id={columnId}
                  className={getStickyClassName(
                    columnId,
                    "group/header relative h-full px-4 border-t border-border flex items-center",
                  )}
                  style={headerStyle}
                >
                  {renderHeaderContent(
                    header,
                    columnId,
                    sortColumn,
                    sortValue,
                    createSortQuery,
                    table,
                    tableId,
                    tableScroll,
                    lastStickyColumnId,
                  )}
                  {header.column.getCanResize() && (
                    <DataTableResizeHandle header={header} />
                  )}
                </DataTableHeaderDraggable>
              );
            })}
          </SortableContext>
        </TableRow>
      ))}
    </TableHeader>
  );
}

/**
 * Renders the content inside a header cell
 */
function renderHeaderContent<TData>(
  header: Header<TData, unknown>,
  columnId: string,
  sortColumn: string | undefined,
  sortValue: string | undefined,
  createSortQuery: (name: string) => void,
  table: Table<TData>,
  tableId: TableId,
  tableScroll?: TableScrollState,
  lastStickyColumnId?: string | null,
) {
  const sortField = SORT_FIELD_MAPS[tableId][columnId];

  // Select column - checkbox
  if (columnId === "select") {
    return (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    );
  }

  // Actions column - static text
  if (columnId === "actions") {
    return (
      <span className="text-muted-foreground w-full text-center">Actions</span>
    );
  }

  // Tax Amount - not sortable
  if (columnId === "taxAmount") {
    return <span className="truncate">Tax Amount</span>;
  }

  // Last sticky column — render sort button + horizontal pagination arrows
  if (columnId === lastStickyColumnId) {
    const sortField = SORT_FIELD_MAPS[tableId][columnId];
    const label = getHeaderLabel(header.column.columnDef);
    return (
      <div className="flex items-center justify-between w-full overflow-hidden">
        <div className="min-w-0 overflow-hidden">
          {sortField ? (
            <SortButton
              label={label}
              sortField={sortField}
              currentSortColumn={sortColumn}
              currentSortValue={sortValue}
              onSort={createSortQuery}
            />
          ) : (
            <span className="truncate">{label}</span>
          )}
        </div>
        {tableScroll?.isScrollable && (
          <HorizontalPagination
            canScrollLeft={tableScroll.canScrollLeft}
            canScrollRight={tableScroll.canScrollRight}
            onScrollLeft={tableScroll.scrollLeft}
            onScrollRight={tableScroll.scrollRight}
            className="hidden md:flex shrink-0"
          />
        )}
      </div>
    );
  }

  // Default sortable header
  if (sortField) {
    const headerLabel = getHeaderLabel(header.column.columnDef);
    return (
      <div className="w-full overflow-hidden">
        <SortButton
          label={headerLabel}
          sortField={sortField}
          currentSortColumn={sortColumn}
          currentSortValue={sortValue}
          onSort={createSortQuery}
        />
      </div>
    );
  }

  // Fallback - just render the header text
  return (
    <span className="truncate">{header.column.columnDef.header as string}</span>
  );
}

function SortButton({
  label,
  sortField,
  currentSortColumn,
  currentSortValue,
  onSort,
}: {
  label: string;
  sortField: string;
  currentSortColumn?: string;
  currentSortValue?: string;
  onSort: (field: string) => void;
}) {
  return (
    <Button
      className="p-0 hover:bg-transparent space-x-2 min-w-0 max-w-full"
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation(); // Prevent drag when clicking sort
        onSort(sortField);
      }}
    >
      <span className="truncate">{label}</span>
      {sortField === currentSortColumn && currentSortValue === "asc" && (
        <ArrowDown size={16} />
      )}
      {sortField === currentSortColumn && currentSortValue === "desc" && (
        <ArrowUp size={16} />
      )}
    </Button>
  );
}
