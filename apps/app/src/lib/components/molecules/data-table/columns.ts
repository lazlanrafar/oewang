/**
 * The transactions table's columns, measured on app.oewang.com.
 *
 * Widths, order and which columns stick came from the live table, not from
 * the snapshot: select 50, date 110, description 320, amount 170, account
 * 200, category 161, with select, date and description stuck to the left and
 * actions stuck to the right.
 *
 * The old table lays its rows out with flex rather than letting the browser
 * size a grid, so every column carries a width in pixels and the sticky ones
 * are offset by the widths of the sticky columns before them.
 *
 * **The table is always as wide as what holds it.** The live table reaches
 * that by letting its last ordinary column take whatever is left:
 * `min-width: 0; flex: 1 1 0%` on that one header, pixel widths with
 * `flex-shrink: 0` on the rest. A table that stops short of its container
 * leaves a strip of page beside rows that look like they should reach it.
 *
 * **A column a reader can drag has a ceiling as well as a floor.** The live
 * table carries both in the cell's own style, `min-width: 100px;
 * max-width: 400px` on the amount, so a drag cannot take one column so wide
 * that every other one is pushed off screen and the table can only be read
 * by scrolling.
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
	/** How wide a drag may take this column. */
	maxWidth: number;
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
	{ key: 'select', label: 'Select', width: 50, minWidth: 50, maxWidth: 50, stickyLeft: true, fixed: true },
	{ key: 'date', label: 'Date', width: 110, minWidth: 90, maxWidth: 180, sortable: true, resizable: true, stickyLeft: true },
	{ key: 'name', label: 'Description', width: 320, minWidth: 160, maxWidth: 560, sortable: true, resizable: true, stickyLeft: true },
	// The two the live table states outright: the amount drags between 100
	// and 400, the account between 120 and 300.
	{ key: 'amount', label: 'Amount', width: 170, minWidth: 120, maxWidth: 400, sortable: true, resizable: true, alignRight: true },
	{ key: 'account', label: 'Account', width: 200, minWidth: 120, maxWidth: 300, resizable: true },
	{ key: 'category', label: 'Category', width: 161, minWidth: 120, maxWidth: 400, resizable: true },
	// 72px, between the old 100, where a 28px button floats, and 56, which
	// crowds it: the button plus 22px either side.
	{ key: 'actions', label: 'Actions', width: 72, minWidth: 72, maxWidth: 72, stickyRight: true, fixed: true }
];

/** The row height every table in the old app uses. */
export const ROW_HEIGHT = 45;

/** The column header's own height, which is a row's height. */
export const HEADER_HEIGHT = ROW_HEIGHT;

/** The day group row, shorter than a data row, as the live table has it. */
export const GROUP_ROW_HEIGHT = 40;

/**
 * Where a day's header parks while that day is on screen.
 *
 * One pixel short of the column header, so the two rules sit on top of each
 * other rather than drawing a double line. Derived rather than written as
 * 44, which is what the live table hard-codes: the moment the header height
 * moves, a literal here goes quietly wrong.
 */
export const GROUP_STICK_TOP = HEADER_HEIGHT - 1;
