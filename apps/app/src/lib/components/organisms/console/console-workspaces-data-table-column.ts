/**
 * The console's workspace table (CSL-4, US-081): name, owner, size and
 * whether it is live. Read only, so there is no row menu.
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const CONSOLE_WORKSPACE_COLUMNS: ColumnSpec[] = [
	{ key: 'name', label: 'Name', width: 240, minWidth: 150, maxWidth: 400, stickyLeft: true, resizable: true, sortable: true, skeleton: { type: 'text', width: 'w-32' } },
	{ key: 'owner_email', label: 'Owner', width: 260, minWidth: 150, maxWidth: 400, resizable: true, skeleton: { type: 'text', width: 'w-40' } },
	{ key: 'members', label: 'Members', width: 120, minWidth: 90, maxWidth: 180, resizable: true, alignRight: true, skeleton: { type: 'text', width: 'w-8' } },
	{ key: 'status', label: 'Status', width: 120, minWidth: 100, maxWidth: 180, resizable: true, skeleton: { type: 'badge' } },
	{ key: 'created_at', label: 'Created', width: 150, minWidth: 120, maxWidth: 220, resizable: true, sortable: true, skeleton: { type: 'text', width: 'w-20' } },
	{ key: 'last_activity_at', label: 'Last activity', width: 150, minWidth: 120, maxWidth: 220, resizable: true, skeleton: { type: 'text', width: 'w-20' } }
];
