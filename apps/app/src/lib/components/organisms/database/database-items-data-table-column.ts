/**
 * The items table's columns (ITM-1). The name sticks to the left, the
 * figures are right aligned, and the price range takes what is left.
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export type ItemSortKey = 'name' | 'last_price' | 'last_bought_at' | 'purchases';

export const ITEM_COLUMNS: ColumnSpec[] = [
	{ key: 'name', label: 'Item', width: 260, minWidth: 160, maxWidth: 480, stickyLeft: true, resizable: true, sortable: true },
	{ key: 'last_price', label: 'Last price', width: 200, minWidth: 140, maxWidth: 300, resizable: true, sortable: true, alignRight: true },
	{ key: 'last_bought_at', label: 'Last bought', width: 160, minWidth: 120, maxWidth: 240, resizable: true, sortable: true },
	{ key: 'purchases', label: 'Bought', width: 110, minWidth: 90, maxWidth: 160, resizable: true, sortable: true, alignRight: true },
	{ key: 'range', label: 'Lowest to highest', width: 280, minWidth: 180, maxWidth: 420, resizable: true }
];
