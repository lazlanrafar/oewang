/**
 * The budget table's columns, the old page's set: the category stuck to the
 * left, the three figures right aligned, the share used as a bar, and the
 * row menu. Every column but the menu sorts, on the server (D103).
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const BUDGET_COLUMNS: ColumnSpec[] = [
	{ key: 'category', label: 'Category', width: 220, minWidth: 150, maxWidth: 400, stickyLeft: true, resizable: true, sortable: true },
	{ key: 'amount', label: 'Budget', width: 150, minWidth: 100, maxWidth: 250, resizable: true, sortable: true, alignRight: true },
	{ key: 'spent', label: 'Spent', width: 150, minWidth: 100, maxWidth: 250, resizable: true, sortable: true, alignRight: true },
	{ key: 'remaining', label: 'Remaining', width: 150, minWidth: 100, maxWidth: 250, resizable: true, sortable: true, alignRight: true },
	{ key: 'percent', label: 'Spent %', width: 240, minWidth: 180, maxWidth: 360, resizable: true, sortable: true },
	{ key: 'actions', label: 'Actions', width: 90, minWidth: 90, maxWidth: 90, stickyRight: true, fixed: true }
];
