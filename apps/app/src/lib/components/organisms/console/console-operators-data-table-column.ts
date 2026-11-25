/** The console's operators (CSL-2, US-085): who holds which console role. */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const CONSOLE_OPERATOR_COLUMNS: ColumnSpec[] = [
	{ key: 'email', label: 'Email', width: 280, minWidth: 160, maxWidth: 440, stickyLeft: true, resizable: true, skeleton: { type: 'text', width: 'w-40' } },
	{ key: 'name', label: 'Name', width: 200, minWidth: 120, maxWidth: 360, resizable: true, skeleton: { type: 'text', width: 'w-28' } },
	{ key: 'role', label: 'Role', width: 180, minWidth: 120, maxWidth: 280, resizable: true, skeleton: { type: 'badge' } },
	{ key: 'last_active_at', label: 'Last active', width: 150, minWidth: 120, maxWidth: 220, resizable: true, skeleton: { type: 'text', width: 'w-20' } },
	{ key: 'actions', label: 'Actions', width: 90, minWidth: 90, maxWidth: 90, stickyRight: true, fixed: true, skeleton: { type: 'icon' } }
];
