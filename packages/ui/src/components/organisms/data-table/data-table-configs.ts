import type { StickyColumnConfig, TableConfig } from "./data-table-types";
import type { TableId } from "./data-table-settings";

/**
 * Sticky column configurations for each table
 */
export const STICKY_COLUMNS: Record<TableId, StickyColumnConfig[]> = {
  users: [{ id: "name", width: 200 }],
  pricing: [{ id: "name", width: 200 }],
  orders: [{ id: "code", width: 200 }],
  accounts: [{ id: "name", width: 200 }],
  transactions: [
    { id: "select", width: 40 },
    { id: "date", width: 110 },
    { id: "name", width: 320 },
  ],
};

/**
 * Sort field mappings for each table
 * Maps column IDs to their backend sort field names
 */
export const SORT_FIELD_MAPS: Record<TableId, Record<string, string>> = {
  users: {
    name: "name",
    email: "email",
    role: "role",
    status: "status",
    createdAt: "createdAt",
  },
  pricing: {
    name: "name",
    price_monthly: "price_monthly",
    price_yearly: "price_yearly",
    created_at: "created_at",
  },
  orders: {
    amount: "amount",
    status: "status",
    created_at: "created_at",
  },
  accounts: {
    name: "name",
    balance: "balance",
    createdAt: "createdAt",
  },
  transactions: {
    name: "name",
    "category.name": "categoryId",
    "wallet.name": "walletId",
    amount: "amount",
    date: "date",
    type: "type",
  },
};

/**
 * Non-reorderable columns for each table (sticky + actions)
 */
export const NON_REORDERABLE_COLUMNS: Record<TableId, Set<string>> = {
  users: new Set(["name", "actions"]),
  pricing: new Set(["name", "actions"]),
  orders: new Set(["code", "actions"]),
  accounts: new Set(["name", "actions"]),
  transactions: new Set(["select", "date", "name", "actions"]),
};

/**
 * Row heights for each table
 */
export const ROW_HEIGHTS: Record<TableId, number> = {
  users: 45,
  pricing: 45,
  orders: 45,
  accounts: 45,
  transactions: 45,
};

/**
 * Summary grid heights for tables with summary sections
 */
export const SUMMARY_GRID_HEIGHTS: Partial<Record<TableId, number>> = {};

/**
 * Complete table configurations
 */
export const TABLE_CONFIGS: Record<TableId, TableConfig> = {
  users: {
    tableId: "users",
    stickyColumns: STICKY_COLUMNS.users,
    sortFieldMap: SORT_FIELD_MAPS.users,
    nonReorderableColumns: NON_REORDERABLE_COLUMNS.users,
    rowHeight: ROW_HEIGHTS.users,
  },
  pricing: {
    tableId: "pricing",
    stickyColumns: STICKY_COLUMNS.pricing,
    sortFieldMap: SORT_FIELD_MAPS.pricing,
    nonReorderableColumns: NON_REORDERABLE_COLUMNS.pricing,
    rowHeight: ROW_HEIGHTS.pricing,
  },
  orders: {
    tableId: "orders",
    stickyColumns: STICKY_COLUMNS.orders,
    sortFieldMap: SORT_FIELD_MAPS.orders,
    nonReorderableColumns: NON_REORDERABLE_COLUMNS.orders,
    rowHeight: ROW_HEIGHTS.orders,
  },
  accounts: {
    tableId: "accounts",
    stickyColumns: STICKY_COLUMNS.accounts,
    sortFieldMap: SORT_FIELD_MAPS.accounts,
    nonReorderableColumns: NON_REORDERABLE_COLUMNS.accounts,
    rowHeight: ROW_HEIGHTS.accounts,
  },
  transactions: {
    tableId: "transactions",
    stickyColumns: STICKY_COLUMNS.transactions,
    sortFieldMap: SORT_FIELD_MAPS.transactions,
    nonReorderableColumns: NON_REORDERABLE_COLUMNS.transactions,
    rowHeight: ROW_HEIGHTS.transactions,
  },
};

/**
 * Get table configuration by ID
 */
export function getTableConfig(tableId: TableId): TableConfig {
  return TABLE_CONFIGS[tableId];
}
