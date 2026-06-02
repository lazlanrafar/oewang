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
import { cn } from "../../../lib/utils";
import { TableCell, TableRow } from "../../atoms";
import {
  ACTIONS_FULL_WIDTH_CELL_CLASS,
  ACTIONS_STICKY_CELL_CLASS,
  type TableColumnMeta,
} from "./data-table-types";

interface VirtualRowProps<TData> {
  row: Row<TData>;
  virtualStart: number;
  rowHeight: number;
  onCellClick?: (rowId: string, columnId: string) => void;
  getStickyStyle: (columnId: string) => CSSProperties;
  getStickyClassName: (columnId: string, baseClassName?: string) => string;
  nonClickableColumns?: Set<string>;
  columnSizing?: ColumnSizingState;
  columnOrder?: ColumnOrderState;
  columnVisibility?: VisibilityState;
  isSelected?: boolean;
  isExporting?: boolean;
  strategy?: "absolute" | "flow";
}

function VirtualRowInner<TData>({
  row,
  virtualStart,
  rowHeight,
  onCellClick,
  getStickyStyle,
  getStickyClassName,
  nonClickableColumns = new Set(["select", "actions"]),
  strategy = "absolute",
}: VirtualRowProps<TData>) {
  const cells = row.getVisibleCells();
  const lastNonStickyColumnId = (() => {
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      if (!c) continue;
      const m = c.column.columnDef.meta as TableColumnMeta | undefined;
      if (!m?.sticky && c.column.id !== "actions") return c.column.id;
    }
    return null;
  })();

  // Check if there are any non-sticky columns visible before actions
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
        strategy === "absolute"
          ? "absolute top-0 left-0 w-full min-w-full"
          : "w-full min-w-full relative",
      )}
      style={{
        height: rowHeight,
        ...(strategy === "absolute" && {
          transform: `translateY(${virtualStart}px)`,
          contain: "layout style paint",
        }),
      }}
    >
      {cells.map((cell: Cell<TData, unknown>) => {
        const columnId = cell.column.id;
        const meta = cell.column.columnDef.meta as TableColumnMeta | undefined;
        const isSticky = meta?.sticky ?? false;
        const isActions = columnId === "actions";
        const actionsFullWidth = isActions && !hasNonStickyBeforeActions;
        const isLastNonSticky = columnId === lastNonStickyColumnId;
        const shouldFlex = isLastNonSticky || actionsFullWidth;

        const cellStyle: CSSProperties = {
          width:
            actionsFullWidth || shouldFlex ? undefined : cell.column.getSize(),
          minWidth: actionsFullWidth
            ? undefined
            : isSticky
              ? cell.column.getSize()
              : cell.column.columnDef.minSize,
          flexShrink: shouldFlex ? 1 : 0,
          maxWidth:
            actionsFullWidth || shouldFlex
              ? undefined
              : isSticky
                ? cell.column.getSize()
                : (cell.column.columnDef.maxSize ?? 800),
          ...(!actionsFullWidth && getStickyStyle(columnId)),
          ...(shouldFlex && { flex: 1, flexGrow: 1 }),
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
              "h-full flex items-center border-b border-border overflow-hidden bg-background transition-colors",
              "group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f]",
              cellClassName,
              isSticky && "z-10",
              (columnId === "select" || isActions) && "justify-center!",
              columnId === "select" && "px-0!",
              shouldFlex && "border-r-0",
            )}
            style={cellStyle}
            onClick={() => {
              if (!nonClickableColumns.has(columnId)) {
                onCellClick?.(row.id, columnId);
              }
            }}
          >
            {columnId === "select" || columnId === "actions" ? (
              <div className="flex items-center justify-center w-full h-full">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
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

// Custom comparison for memo - re-render when row data, position, or column state changes
function arePropsEqual<TData>(
  prevProps: VirtualRowProps<TData>,
  nextProps: VirtualRowProps<TData>,
): boolean {
  return (
    prevProps.row.id === nextProps.row.id &&
    prevProps.virtualStart === nextProps.virtualStart &&
    prevProps.rowHeight === nextProps.rowHeight &&
    // Check if row selection state changed (use prop for reliable comparison)
    prevProps.isSelected === nextProps.isSelected &&
    // Check if exporting state changed (for showing loading spinners)
    prevProps.isExporting === nextProps.isExporting &&
    // Re-render when column sizing, order, or visibility changes (reference equality)
    prevProps.columnSizing === nextProps.columnSizing &&
    prevProps.columnOrder === nextProps.columnOrder &&
    prevProps.columnVisibility === nextProps.columnVisibility &&
    // Re-render when row data changes (e.g., category, assigned, status)
    prevProps.row.original === nextProps.row.original
  );
}

// Export memoized component with generics
export const VirtualRow = memo(VirtualRowInner, arePropsEqual) as <TData>(
  props: VirtualRowProps<TData>,
) => React.ReactNode;
