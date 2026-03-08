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
  const lastCellId = cells[cells.length - 1]?.column.id ?? "";
  const lastNonStickyIndex = (() => {
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      if (!c) continue;
      const m = c.column.columnDef.meta as TableColumnMeta | undefined;
      if (!m?.sticky && c.column.id !== "actions") return i;
    }
    return -1;
  })();

  const hasNonStickyBeforeActions = cells.some((cell) => {
    if (cell.column.id === "actions") return false;
    const meta = cell.column.columnDef.meta as TableColumnMeta | undefined;
    return !(meta?.sticky ?? false);
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
      {cells.map((cell: Cell<TData, unknown>, cellIndex: number) => {
        const columnId = cell.column.id;
        const meta = cell.column.columnDef.meta as TableColumnMeta | undefined;
        const isSticky = meta?.sticky ?? false;
        const isActions = columnId === "actions";
        const isLastBeforeActions =
          cellIndex === cells.length - 2 && lastCellId === "actions";
        const actionsFullWidth = isActions && !hasNonStickyBeforeActions;
        const isLastNonSticky = cellIndex === lastNonStickyIndex;
        const shouldFlex =
          isLastNonSticky ||
          (isLastBeforeActions && !isSticky) ||
          actionsFullWidth;

        const cellStyle: CSSProperties = {
          width:
            actionsFullWidth || shouldFlex ? undefined : cell.column.getSize(),
          minWidth: actionsFullWidth
            ? undefined
            : isSticky
              ? cell.column.getSize()
              : cell.column.columnDef.minSize,
          maxWidth: actionsFullWidth
            ? undefined
            : isSticky
              ? cell.column.getSize()
              : cell.column.columnDef.maxSize,
          flexShrink: shouldFlex ? 1 : 0,
          ...(!actionsFullWidth && getStickyStyle(columnId)),
          ...(shouldFlex && { flex: 1 }),
        };

        const cellClassName = isActions
          ? actionsFullWidth
            ? ACTIONS_FULL_WIDTH_CELL_CLASS
            : ACTIONS_STICKY_CELL_CLASS
          : getStickyClassName(columnId, meta?.className);

        return (
          <TableCell
            key={cell.id}
            className={cn(
              "h-full flex items-center border-b border-border overflow-hidden bg-background",
              cellClassName,
              isSticky && "z-10",
            )}
            style={cellStyle}
            onClick={() => {
              if (!nonClickableColumns.has(columnId)) {
                onCellClick?.(row.id, columnId);
              }
            }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
    prevProps.row.original === nextProps.row.original
  );
}

export const DataTableRow = memo(DataTableRowInner, arePropsEqual) as <TData>(
  props: DataTableRowProps<TData>,
) => React.ReactNode;
