/**
 * The debt table's columns, the old page's set: select and contact stuck to
 * the left, then type, description, the summary (what remains, with the
 * original struck through once something is paid), status, due date, and the
 * row menu (DEBT-11, D120). The figures sort on the server.
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const DEBT_COLUMNS: ColumnSpec[] = [
	{ key: 'select', label: 'Select', width: 50, minWidth: 50, maxWidth: 50, stickyLeft: true, fixed: true, cellClass: 'px-0', headClass: 'px-0', skeleton: { type: 'checkbox', width: 'w-5' } },
	{ key: 'contact', label: 'Contact', width: 200, minWidth: 140, maxWidth: 360, stickyLeft: true, resizable: true, sortable: true, skeleton: { type: 'text', width: 'w-28' } },
	{ key: 'type', label: 'Type', width: 150, minWidth: 60, maxWidth: 220, resizable: true, skeleton: { type: 'text', width: 'w-20' } },
	{ key: 'description', label: 'Description', width: 240, minWidth: 120, maxWidth: 420, resizable: true, skeleton: { type: 'text', width: 'w-40' } },
	{ key: 'remaining', label: 'Summary', width: 170, minWidth: 120, maxWidth: 260, resizable: true, sortable: true, skeleton: { type: 'text', width: 'w-24' } },
	{ key: 'status', label: 'Status', width: 120, minWidth: 100, maxWidth: 180, resizable: true, skeleton: { type: 'text', width: 'w-16' } },
	{ key: 'due_date', label: 'Due Date', width: 150, minWidth: 110, maxWidth: 220, resizable: true, sortable: true, skeleton: { type: 'text', width: 'w-24' } },
	{ key: 'actions', label: 'Actions', width: 90, minWidth: 90, maxWidth: 90, stickyRight: true, fixed: true, skeleton: { type: 'icon' } }
];
