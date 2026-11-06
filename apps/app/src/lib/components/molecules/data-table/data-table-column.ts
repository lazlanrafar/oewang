/**
 * What a column is, and the heights every table in this app shares.
 *
 * The shell this feeds lays its rows out with flex rather than letting the
 * browser size a grid, so every column carries a width in pixels and the
 * sticky ones are offset by the widths of the sticky columns before them.
 *
 * **The table is always as wide as what holds it.** The live app reaches
 * that by letting the last ordinary column take whatever is left:
 * `min-width: 0; flex: 1 1 0%` on that one header, pixel widths with
 * `flex-shrink: 0` on the rest. A table that stops short of its container
 * leaves a strip of page beside rows that look like they should reach it.
 *
 * **A column a reader can drag has a ceiling as well as a floor.** The live
 * app carries both in the cell's own style, `min-width: 100px;
 * max-width: 400px`, so a drag cannot take one column so wide that every
 * other one is pushed off screen and the table can only be read by
 * scrolling.
 *
 * A feature's own column list lives with that feature, not here: this
 * module is the design system and knows nothing about what is in a row.
 */
import type { SkeletonSpec } from './data-table-types.js';

export type ColumnSpec = {
	/**
	 * A plain string, because the shell this feeds is shared and no two
	 * lists have the same columns. A table that wants its own keys checked
	 * narrows this itself, as a feature's column list does.
	 */
	key: string;
	label: string;
	width: number;
	minWidth: number;
	/** How wide a drag may take this column. */
	maxWidth: number;
	sortable?: boolean;
	resizable?: boolean;
	/** Sticks to the left, in the order these columns appear. */
	stickyLeft?: boolean;
	/** Sticks to the right edge, as an actions column does. */
	stickyRight?: boolean;
	/** Furniture: not offered in the column-visibility menu. */
	fixed?: boolean;
	alignRight?: boolean;
	/**
	 * Extra classes for this column's cells and header.
	 *
	 * A cell has no padding of its own, because what sits in one differs:
	 * text is inset, an in-cell picker fills the cell edge to edge, and a
	 * checkbox is centred in no padding at all. That belongs with the column,
	 * not repeated at every row.
	 */
	cellClass?: string;
	headClass?: string;
	/** What this column's cells show while the rows load. A text bar if omitted. */
	skeleton?: SkeletonSpec;
};

/** The row height every table in the old app uses. */
export const ROW_HEIGHT = 45;

/** The column header's own height, which is a row's height. */
export const HEADER_HEIGHT = ROW_HEIGHT;

/** A group header row, shorter than a data row, as the live table has it. */
export const GROUP_ROW_HEIGHT = 40;

/**
 * Where a group's header parks while that group is on screen.
 *
 * One pixel short of the column header, so the two rules sit on top of each
 * other rather than drawing a double line. Derived rather than written as
 * 44, which is what the live table hard-codes: the moment the header height
 * moves, a literal here goes quietly wrong.
 */
export const GROUP_STICK_TOP = HEADER_HEIGHT - 1;
