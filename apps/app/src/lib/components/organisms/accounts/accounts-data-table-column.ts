/**
 * The accounts table's columns, measured on app.oewang.com.
 *
 * Read off the live page rather than estimated: name 200 and stuck to the
 * left, group 150, balance 150 and right aligned, created-at taking what is
 * left, actions 90. The row height and the `ColumnSpec` shape are the
 * transactions table's, because the two tables are the same table with
 * different columns and a width that drifted between them would show.
 *
 * There is no sort here, as there is none on the live page: the list is
 * unpaginated and arrives in the order the API chose, which is group then
 * sort order then name.
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const ACCOUNT_COLUMNS: ColumnSpec[] = [
	{ key: 'name', label: 'Name', width: 200, minWidth: 120, maxWidth: 400, stickyLeft: true, resizable: true },
	{ key: 'group', label: 'Group', width: 150, minWidth: 100, maxWidth: 300, resizable: true },
	{ key: 'balance', label: 'Balance', width: 150, minWidth: 100, maxWidth: 250, resizable: true, alignRight: true },
	{ key: 'created', label: 'Created', width: 220, minWidth: 120, maxWidth: 320, resizable: true },
	// Furniture: it holds the row menu and is never offered in a column menu.
	{ key: 'actions', label: 'Actions', width: 90, minWidth: 90, maxWidth: 90, stickyRight: true, fixed: true }
];
