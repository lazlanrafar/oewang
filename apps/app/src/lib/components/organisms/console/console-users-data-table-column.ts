/**
 * The console's user table (CSL-3, US-081): who signed up, when, how many
 * workspaces they belong to and when they were last seen. Read only, so
 * there is no row menu.
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const CONSOLE_USER_COLUMNS: ColumnSpec[] = [
	{ key: 'email', label: 'Email', width: 280, minWidth: 160, maxWidth: 440, stickyLeft: true, resizable: true, sortable: true, skeleton: { type: 'text', width: 'w-40' } },
	{ key: 'name', label: 'Name', width: 200, minWidth: 120, maxWidth: 360, resizable: true, skeleton: { type: 'text', width: 'w-28' } },
	{ key: 'workspaces', label: 'Workspaces', width: 130, minWidth: 100, maxWidth: 200, resizable: true, alignRight: true, skeleton: { type: 'text', width: 'w-8' } },
	{ key: 'console_role', label: 'Console role', width: 150, minWidth: 110, maxWidth: 240, resizable: true, skeleton: { type: 'badge' } },
	{ key: 'created_at', label: 'Joined', width: 150, minWidth: 120, maxWidth: 220, resizable: true, sortable: true, skeleton: { type: 'text', width: 'w-20' } },
	{ key: 'last_active_at', label: 'Last active', width: 150, minWidth: 120, maxWidth: 220, resizable: true, skeleton: { type: 'text', width: 'w-20' } }
];
