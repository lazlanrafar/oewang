/**
 * The console's feedback inbox (CSL-8, US-083): what was said, by whom,
 * from which workspace, and whether it is dealt with. Newest first, the
 * only order the API offers, so no column sorts.
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const CONSOLE_FEEDBACK_COLUMNS: ColumnSpec[] = [
	{ key: 'message', label: 'Message', width: 360, minWidth: 200, maxWidth: 600, stickyLeft: true, resizable: true, skeleton: { type: 'text', width: 'w-48' } },
	{ key: 'type', label: 'Type', width: 150, minWidth: 110, maxWidth: 220, resizable: true, skeleton: { type: 'badge' } },
	{ key: 'user_email', label: 'From', width: 240, minWidth: 140, maxWidth: 400, resizable: true, skeleton: { type: 'text', width: 'w-36' } },
	{ key: 'workspace_name', label: 'Workspace', width: 200, minWidth: 120, maxWidth: 360, resizable: true, skeleton: { type: 'text', width: 'w-28' } },
	{ key: 'status', label: 'Status', width: 110, minWidth: 90, maxWidth: 160, resizable: true, skeleton: { type: 'badge' } },
	{ key: 'created_at', label: 'Received', width: 140, minWidth: 110, maxWidth: 200, resizable: true, skeleton: { type: 'text', width: 'w-20' } }
];
