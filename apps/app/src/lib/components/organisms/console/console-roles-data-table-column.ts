/** The console's roles (CSL-2, US-085): each role, what it allows, and who holds it. */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const CONSOLE_ROLE_COLUMNS: ColumnSpec[] = [
	{ key: 'name', label: 'Name', width: 220, minWidth: 150, maxWidth: 360, stickyLeft: true, resizable: true, skeleton: { type: 'text', width: 'w-28' } },
	{ key: 'description', label: 'Description', width: 260, minWidth: 150, maxWidth: 480, resizable: true, skeleton: { type: 'text', width: 'w-40' } },
	{ key: 'permissions', label: 'Permissions', width: 420, minWidth: 200, maxWidth: 800, resizable: true, skeleton: { type: 'tags' } },
	{ key: 'operators', label: 'Operators', width: 120, minWidth: 90, maxWidth: 180, resizable: true, alignRight: true, skeleton: { type: 'text', width: 'w-8' } },
	{ key: 'actions', label: 'Actions', width: 90, minWidth: 90, maxWidth: 90, stickyRight: true, fixed: true, skeleton: { type: 'icon' } }
];
