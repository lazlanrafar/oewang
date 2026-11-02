/**
 * The transactions table's columns, with the widths the old app gives them
 * (`STICKY_COLUMNS.transactions` and the column definitions beside it).
 *
 * The old table lays its rows out with flex rather than letting the browser
 * size a grid, so every column carries a width in pixels and the last visible
 * one flexes to fill what is left.
 */
export type ColumnKey = 'select' | 'date' | 'name' | 'category' | 'wallet' | 'amount' | 'actions';

export type ColumnSpec = {
	key: ColumnKey;
	label: string;
	width: number;
	sortable?: boolean;
	/** Hidden from the column-visibility menu, because it is furniture. */
	fixed?: boolean;
	alignRight?: boolean;
};

export const TRANSACTION_COLUMNS: ColumnSpec[] = [
	{ key: 'select', label: 'Select', width: 50, fixed: true },
	{ key: 'date', label: 'Date', width: 110, sortable: true },
	{ key: 'name', label: 'Description', width: 320, sortable: true },
	{ key: 'category', label: 'Category', width: 180 },
	{ key: 'wallet', label: 'Wallet', width: 160 },
	{ key: 'amount', label: 'Amount', width: 160, sortable: true, alignRight: true },
	{ key: 'actions', label: 'Actions', width: 100, fixed: true }
];

/** The row height every table in the old app uses. */
export const ROW_HEIGHT = 45;
