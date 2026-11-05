/**
 * The generic table. It knows geometry, ARIA, resizing, sideways scrolling,
 * group rows and paging, and nothing about what is in a row: a feature's
 * columns, row model and grouping rules live with that feature.
 *
 * Everything public is re-exported here, so other modules import the
 * folder rather than reaching into a file inside it.
 */
export { default as DataTable } from './data-table.svelte';
export { default as DataTableEmptyState } from './data-table-empty-state.svelte';
export {
	GROUP_ROW_HEIGHT,
	GROUP_STICK_TOP,
	HEADER_HEIGHT,
	ROW_HEIGHT,
	type ColumnSpec
} from './data-table-column.js';
export { CELL, HEAD, tableLayout, type TableLayout } from './data-table-layout.svelte.js';
export type { NamedOption, RowGroup, TableSort } from './data-table-types.js';
export { blockHeights, windowOf, type VirtualWindow } from './data-table-virtual-window.js';
