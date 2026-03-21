import type { VisibilityState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { StickyColumnConfig } from "../components/organisms/data-table/data-table-types";
import { STICKY_COLUMNS } from "../components/organisms/data-table/data-table-configs";
import { TableId } from "../components/organisms/data-table/data-table-settings";
import { cn } from "../lib/utils";

interface TableColumn {
  id: string;
  getIsVisible: () => boolean;
}

interface TableInterface {
  getAllLeafColumns: () => TableColumn[];
}

interface UseStickyColumnsProps {
  columnVisibility?: VisibilityState;
  table?: TableInterface;
  loading?: boolean;
  /** Sticky column configuration - can be full config or just IDs if tableId is provided */
  stickyColumns?: StickyColumnConfig[] | string[];
  /** Table ID for looking up column widths if stickyColumns is just IDs */
  tableId?: TableId;
}

export function useStickyColumns({
  columnVisibility,
  table,
  loading,
  stickyColumns,
  tableId,
}: UseStickyColumnsProps) {
  // Memoize resolved sticky columns with widths
  const resolvedStickyColumns = useMemo((): StickyColumnConfig[] => {
    // If no columns provided, use defaults for the tableId
    if (!stickyColumns) {
      return tableId ? STICKY_COLUMNS[tableId] : STICKY_COLUMNS.users;
    }

    // If already full configs, return as is (ignoring type check for a moment to handle both)
    if (stickyColumns.length > 0 && typeof stickyColumns[0] === "object") {
      return stickyColumns as StickyColumnConfig[];
    }

    // Otherwise, it's stringIDs - resolve them
    const ids = stickyColumns as string[];
    const tableConfig = tableId
      ? STICKY_COLUMNS[tableId]
      : STICKY_COLUMNS.users;

    if (!tableConfig) {
      return ids.map((id) => ({ id, width: 150 }));
    }

    return ids
      .map((id) => {
        const config = tableConfig.find((c: StickyColumnConfig) => c.id === id);
        return config ? config : { id, width: 150 }; // Fallback width
      })
      .filter(Boolean) as StickyColumnConfig[];
  }, [stickyColumns, tableId]);

  // Memoize isVisible to prevent breaking downstream useMemo dependencies
  const isVisible = useCallback(
    (id: string) =>
      loading ||
      table
        ?.getAllLeafColumns()
        .find((col) => col.id === id)
        ?.getIsVisible() ||
      (columnVisibility && columnVisibility[id] !== false),
    [loading, table, columnVisibility],
  );

  // Get sticky column IDs for quick lookup
  const stickyColumnIds = useMemo(
    () => new Set((resolvedStickyColumns || []).map((col) => col.id)),
    [resolvedStickyColumns],
  );

  // Calculate dynamic sticky positions based on configuration
  const stickyPositions = useMemo(() => {
    let position = 0;
    const positions: Record<string, number> = {};

    for (const col of resolvedStickyColumns) {
      if (isVisible(col.id)) {
        positions[col.id] = position;
        position += col.width;
      }
    }

    return positions;
  }, [isVisible, resolvedStickyColumns]);

  // Memoize getStickyStyle to return stable function reference
  const getStickyStyle = useCallback(
    (columnId: string) => {
      const position = stickyPositions[columnId];
      return position !== undefined
        ? ({ "--stick-left": `${position}px` } as React.CSSProperties)
        : {};
    },
    [stickyPositions],
  );

  // Memoize getStickyClassName to return stable function reference
  const getStickyClassName = useCallback(
    (columnId: string, baseClassName?: string) => {
      const isSticky = stickyColumnIds.has(columnId);
      return cn(baseClassName, isSticky && "sticky left-[var(--stick-left)]");
    },
    [stickyColumnIds],
  );

  return {
    stickyPositions,
    getStickyStyle,
    getStickyClassName,
    isVisible,
  };
}
