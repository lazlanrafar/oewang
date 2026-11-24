/**
 * The contact table's columns: the old page's name, email and phone, and
 * the row menu (CON-2). The old website and location columns go with their
 * fields, which served invoices (D120).
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const CONTACT_COLUMNS: ColumnSpec[] = [
	{ key: 'name', label: 'Name', width: 240, minWidth: 150, maxWidth: 400, stickyLeft: true, resizable: true, sortable: true, skeleton: { type: 'text', width: 'w-32' } },
	{ key: 'email', label: 'Email', width: 260, minWidth: 150, maxWidth: 400, resizable: true, skeleton: { type: 'text', width: 'w-40' } },
	{ key: 'phone', label: 'Phone', width: 200, minWidth: 120, maxWidth: 300, resizable: true, skeleton: { type: 'text', width: 'w-28' } },
	{ key: 'actions', label: 'Actions', width: 90, minWidth: 90, maxWidth: 90, stickyRight: true, fixed: true, skeleton: { type: 'icon' } }
];
