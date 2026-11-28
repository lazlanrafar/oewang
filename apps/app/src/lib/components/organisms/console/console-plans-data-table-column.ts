/** The console's plans (PLN-1, OEW-131): each plan, its limits and features, and who holds it. */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const CONSOLE_PLAN_COLUMNS: ColumnSpec[] = [
	{ key: 'name', label: 'Name', width: 220, minWidth: 150, maxWidth: 360, stickyLeft: true, resizable: true, skeleton: { type: 'text', width: 'w-28' } },
	{ key: 'tokens', label: 'Tokens a month', width: 160, minWidth: 120, maxWidth: 240, resizable: true, alignRight: true, skeleton: { type: 'text', width: 'w-16' } },
	{ key: 'storage', label: 'Storage', width: 130, minWidth: 100, maxWidth: 200, resizable: true, alignRight: true, skeleton: { type: 'text', width: 'w-14' } },
	{ key: 'features', label: 'Features', width: 420, minWidth: 200, maxWidth: 800, resizable: true, skeleton: { type: 'tags' } },
	{ key: 'workspaces', label: 'Workspaces', width: 130, minWidth: 90, maxWidth: 180, resizable: true, alignRight: true, skeleton: { type: 'text', width: 'w-8' } },
	{ key: 'actions', label: 'Actions', width: 90, minWidth: 90, maxWidth: 90, stickyRight: true, fixed: true, skeleton: { type: 'icon' } }
];
