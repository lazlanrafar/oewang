"use client";

import type {
  Cell,
  ColumnOrderState,
  ColumnSizingState,
  Row,
  VisibilityState,
} from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type React from "react";
import type { CSSProperties } from "react";
import { memo } from "react";
import {
  ACTIONS_FULL_WIDTH_CELL_CLASS,
  ACTIONS_STICKY_CELL_CLASS,
  TableColumnMeta,
} from "./data-table-types";
import { TableCell, TableRow } from "../../atoms";
import { cn } from "../../../lib/utils";

interface DataTableRowProps<TData> {
  row: Row<TData>;
  rowHeight: number;
  onCellClick?: (rowId: string, columnId: string) => void;
  getStickyStyle: (columnId: string) => CSSProperties;
  getStickyClassName: (columnId: string, baseClassName?: string) => string;
  nonClickableColumns?: Set<string>;
  columnSizing?: ColumnSizingState;
  columnOrder?: ColumnOrderState;
  columnVisibility?: VisibilityState;
  isSelected?: boolean;
}

function DataTableRowInner<TData>({
  row,
  rowHeight,
  onCellClick,
  getStickyStyle,
  getStickyClassName,
  nonClickableColumns = new Set(["select", "actions"]),
}: DataTableRowProps<TData>) {
  const cells = row.getVisibleCells();
  const lastNonStickyColumnId = (() => {
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      if (!c) continue;
      const m = c.column.columnDef.meta as TableColumnMeta | undefined;
      // Skip actions and sticky columns
      if (c.column.id !== "actions" && !m?.sticky) {
        return c.column.id;
      }
    }
    return null;
  })();

  const hasNonStickyVisible = cells.some((cell) => {
    if (cell.column.id === "actions") return false;
    const meta = cell.column.columnDef.meta as TableColumnMeta | undefined;
    return !meta?.sticky;
  });

  return (
    <TableRow
      data-index={row.index}
      className={cn(
        "group cursor-pointer select-text",
        "hover:bg-[#F2F1EF] hover:dark:bg-[#0f0f0f]",
        "flex items-center border-0",
        "w-full min-w-full",
      )}
      style={{ height: rowHeight }}
    >
      {cells.map((cell: Cell<TData, unknown>) => {
        const columnId = cell.column.id;
        const meta = cell.column.columnDef.meta as TableColumnMeta | undefined;
        const isSticky = meta?.sticky ?? false;
        const isActions = columnId === "actions";
        const isSelect = columnId === "select";
        const actionsFullWidth = isActions && !hasNonStickyVisible;
        const isLastNonSticky = columnId === lastNonStickyColumnId;
        const shouldFlex = isLastNonSticky || (isActions && actionsFullWidth);

        const cellStyle: CSSProperties = {
          width:
            actionsFullWidth || shouldFlex ? undefined : cell.column.getSize(),
          minWidth: actionsFullWidth
            ? 0
            : isSticky
              ? cell.column.getSize()
              : cell.column.columnDef.minSize,
          maxWidth:
            actionsFullWidth || shouldFlex
              ? undefined
              : isSticky
                ? cell.column.getSize()
                : cell.column.columnDef.maxSize,
          flexShrink: shouldFlex ? 1 : 0,
          ...(!actionsFullWidth && getStickyStyle(columnId)),
          ...(shouldFlex && {
            flex: "1 1 0%",
            flexGrow: 1,
            minWidth: 0,
          }),
        };

        const cellClassName = isActions
          ? actionsFullWidth
            ? ACTIONS_FULL_WIDTH_CELL_CLASS
            : ACTIONS_STICKY_CELL_CLASS
          : getStickyClassName(columnId, meta?.className);

        const isClickable = !nonClickableColumns.has(columnId);

        if (isSelect) {
          return (
            <TableCell
              key={cell.id}
              className={cn(
                getStickyClassName(
                  columnId,
                  "bg-background z-20 px-0 h-full flex items-center border-b border-border",
                ),
              )}
              style={cellStyle}
            >
              <div className="flex items-center justify-center w-full h-full">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            </TableCell>
          );
        }

        if (isActions) {
          return (
            <TableCell
              key={cell.id}
              className={getStickyClassName(
                columnId,
                cn(
                  actionsFullWidth
                    ? ACTIONS_FULL_WIDTH_CELL_CLASS
                    : ACTIONS_STICKY_CELL_CLASS,
                  "h-full flex items-center justify-center border-b border-border bg-background px-4",
                ),
              )}
              style={cellStyle}
            >
              <div className="flex items-center justify-center w-full h-full">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            </TableCell>
          );
        }

        return (
          <TableCell
            key={cell.id}
            className={cn(
              "h-full flex items-center border-b border-border overflow-hidden bg-background transition-colors",
              "group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f]",
              cellClassName,
              isSticky && "z-10",
              isClickable ? "cursor-pointer" : "cursor-default",
              shouldFlex && "border-r-0",
            )}
            style={cellStyle}
            onClick={(e) => {
              if (isClickable) {
                onCellClick?.(row.id, columnId);
              } else {
                // For non-clickable columns (like select or category),
                // we want to ensure any internal clicks don't bubble up
                // to table row click handlers if they exist elsewhere.
                e.stopPropagation();
              }
            }}
          >
            {columnId === "select" || columnId === "actions" ? (
              flexRender(cell.column.columnDef.cell, cell.getContext())
            ) : (
              <div className="w-full overflow-hidden truncate">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

function arePropsEqual<TData>(
  prevProps: DataTableRowProps<TData>,
  nextProps: DataTableRowProps<TData>,
): boolean {
  return (
    prevProps.row.id === nextProps.row.id &&
    prevProps.rowHeight === nextProps.rowHeight &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.columnSizing === nextProps.columnSizing &&
    prevProps.columnOrder === nextProps.columnOrder &&
    prevProps.columnVisibility === nextProps.columnVisibility &&
    prevProps.row.original === nextProps.row.original &&
    prevProps.nonClickableColumns === nextProps.nonClickableColumns &&
    prevProps.onCellClick === nextProps.onCellClick
  );
}

export const DataTableRow = memo(DataTableRowInner, arePropsEqual) as <TData>(
  props: DataTableRowProps<TData>,
) => React.ReactNode;
