/**
 * The transactions table's columns, measured on app.oewang.com.
 *
 * Widths, order and which columns stick came from the live table, not from
 * the snapshot: select 50, date 110, description 320, amount 170, account
 * 200, category 161, actions 100, with select, date and description stuck to
 * the left and actions stuck to the right.
 *
 * The old table lays its rows out with flex rather than letting the browser
 * size a grid, so every column carries a width in pixels and the sticky ones
 * are offset by the widths of the sticky columns before them.
 */
export type ColumnKey =
	| 'select'
	| 'date'
	| 'name'
	| 'amount'
	| 'account'
	| 'category'
	| 'actions';

export type ColumnSpec = {
	key: ColumnKey;
	label: string;
	width: number;
	minWidth: number;
	sortable?: boolean;
	resizable?: boolean;
	/** Sticks to the left, in the order these columns appear. */
	stickyLeft?: boolean;
	/** Sticks to the right edge, as the actions column does. */
	stickyRight?: boolean;
	/** Furniture: not offered in the column-visibility menu. */
	fixed?: boolean;
	alignRight?: boolean;
};

export const TRANSACTION_COLUMNS: ColumnSpec[] = [
	{ key: 'select', label: 'Select', width: 50, minWidth: 50, stickyLeft: true, fixed: true },
	{ key: 'date', label: 'Date', width: 110, minWidth: 90, sortable: true, resizable: true, stickyLeft: true },
	{ key: 'name', label: 'Description', width: 320, minWidth: 160, sortable: true, resizable: true, stickyLeft: true },
	{ key: 'amount', label: 'Amount', width: 170, minWidth: 120, sortable: true, resizable: true, alignRight: true },
	{ key: 'account', label: 'Account', width: 200, minWidth: 120, resizable: true },
	{ key: 'category', label: 'Category', width: 161, minWidth: 120, resizable: true },
	{ key: 'actions', label: 'Actions', width: 100, minWidth: 100, stickyRight: true, fixed: true }
];

/** The row height every table in the old app uses. */
export const ROW_HEIGHT = 45;
