/**
 * The geometry every table in this app shares.
 *
 * Widths, the sticky offsets, which edge drops its rule, and the two class
 * strings a cell and a header wear. It lives apart from any one table
 * because the alternative is two tables each computing the same thing, and
 * the first time one of them is adjusted the other is quietly wrong.
 *
 * The layout is flex with pixel widths rather than a CSS grid, which is
 * what keeps the columns aligned while the body scrolls sideways (D57,
 * D60). The last ordinary column takes the remainder so the table is always
 * as wide as what holds it.
 */
import type { ColumnSpec } from './data-table-column.js';

/** A rule on the right of every cell as well as under it, which is the grid. */
export const CELL =
	'h-full flex items-center border-r border-b border-border overflow-hidden bg-background transition-colors group-hover:bg-row-hover';

/** The header's colour and weight, measured on the live app: #666666 at 500. */
export const HEAD =
	'text-subtle relative flex h-full items-center border-t border-r border-b border-border bg-background px-4 font-medium';

export type TableLayout = {
	/** What the table needs before it has to scroll sideways. */
	totalWidth: number;
	/** `style` for one column's cell, width and sticky offset included. */
	cellStyle: (key: string) => string;
	stickyClass: (column: ColumnSpec) => string;
	/** The outer edges belong to the table, not to a cell. */
	edgeClass: (key: string) => string;
};

/**
 * @param columns the visible columns, in order
 * @param widths  a column's current width when a drag has changed it
 */
export function tableLayout(
	columns: ColumnSpec[],
	widths: Record<string, number | undefined> = {}
): TableLayout {
	const widthOf = (column: ColumnSpec) => widths[column.key] ?? column.width;

	// A sticky column's offset is the sum of the sticky columns before it, so
	// hiding or resizing one moves the rest.
	const offsets: Record<string, number> = {};
	let left = 0;
	for (const column of columns) {
		if (!column.stickyLeft) continue;
		offsets[column.key] = left;
		left += widthOf(column);
	}

	const fillKey = columns.filter((column) => !column.stickyRight).at(-1)?.key;

	const totalWidth = columns.reduce(
		(sum, column) => sum + (column.key === fillKey ? column.minWidth : widthOf(column)),
		0
	);

	const lastKey = columns.at(-1)?.key;
	const beforeStickyRight = columns.at(-1)?.stickyRight ? columns.at(-2)?.key : undefined;

	return {
		totalWidth,

		cellStyle(key) {
			const column = columns.find((candidate) => candidate.key === key);
			if (!column) return '';

			// The filling column states no width at all: a basis of zero and
			// the freedom to grow is what makes it take the remainder rather
			// than a share of it.
			if (column.key === fillKey) return `flex: 1 1 0%; min-width: ${column.minWidth}px;`;

			// The floor and the ceiling are the column's own, not today's
			// width: they are what a drag is allowed to do.
			const size = `width: ${widthOf(column)}px; min-width: ${column.minWidth}px; max-width: ${column.maxWidth}px; flex-shrink: 0;`;
			return column.stickyLeft ? `${size} left: ${offsets[key] ?? 0}px;` : size;
		},

		stickyClass(column) {
			if (column.stickyLeft) return 'sticky z-20';
			if (column.stickyRight) return 'border-border sticky right-0 z-20 border-r-0 border-l';
			return '';
		},

		// The rule belongs between columns, not on the table's outer edge, and
		// not twice at the seam: a sticky right column draws its own left
		// border, so the column before it drops its right one.
		edgeClass: (key) => (key === lastKey || key === beforeStickyRight ? 'border-r-0' : '')
	};
}
