/**
 * The transactions table's columns, measured on app.oewang.com.
 *
 * Widths, order and which columns stick came from the live table, not from
 * the snapshot: select 50, date 110, description 320, amount 170, account
 * 200, category 161, with select, date and description stuck to the left and
 * actions stuck to the right.
 *
 * The shape itself, and the rules behind the widths, belong to the table
 * shell in `$lib/components/molecules/data-table`. Only the list is here,
 * because only this module knows what a transaction has in it.
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export type ColumnKey =
	| 'select'
	| 'date'
	| 'name'
	| 'amount'
	| 'account'
	| 'category'
	| 'actions';

export const TRANSACTION_COLUMNS: Array<ColumnSpec & { key: ColumnKey }> = [
	// A cell's padding is the column's: text is inset by 16, the two in-cell
	// pickers fill their cell edge to edge, and the checkbox and the actions
	// button are centred in none.
	{ key: 'select', label: 'Select', width: 50, minWidth: 50, maxWidth: 50, stickyLeft: true, fixed: true, cellClass: 'px-0', headClass: 'px-0' },
	{ key: 'date', label: 'Date', width: 110, minWidth: 90, maxWidth: 180, sortable: true, resizable: true, stickyLeft: true, cellClass: 'px-4' },
	{ key: 'name', label: 'Description', width: 320, minWidth: 160, maxWidth: 560, sortable: true, resizable: true, stickyLeft: true, cellClass: 'px-4' },
	// The two the live table states outright: the amount drags between 100
	// and 400, the account between 120 and 300.
	{ key: 'amount', label: 'Amount', width: 170, minWidth: 120, maxWidth: 400, sortable: true, resizable: true, alignRight: true, cellClass: 'px-4' },
	{ key: 'account', label: 'Account', width: 200, minWidth: 120, maxWidth: 300, resizable: true, cellClass: 'p-0' },
	{ key: 'category', label: 'Category', width: 161, minWidth: 120, maxWidth: 400, resizable: true, cellClass: 'p-0' },
	// 72px, between the old 100, where a 28px button floats, and 56, which
	// crowds it: the button plus 22px either side.
	{ key: 'actions', label: 'Actions', width: 72, minWidth: 72, maxWidth: 72, stickyRight: true, fixed: true, cellClass: 'justify-center px-0', headClass: 'justify-center px-0' }
];
