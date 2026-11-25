/** The operator audit (CSL-12, US-085): when, who, what, and to which thing. Newest first. */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export const CONSOLE_AUDIT_COLUMNS: ColumnSpec[] = [
	{ key: 'created_at', label: 'When', width: 180, minWidth: 140, maxWidth: 260, stickyLeft: true, resizable: true, skeleton: { type: 'text', width: 'w-28' } },
	{ key: 'operator_email', label: 'Operator', width: 260, minWidth: 150, maxWidth: 400, resizable: true, skeleton: { type: 'text', width: 'w-40' } },
	{ key: 'action', label: 'Action', width: 260, minWidth: 160, maxWidth: 400, resizable: true, skeleton: { type: 'text', width: 'w-36' } },
	{ key: 'entity', label: 'Changed', width: 200, minWidth: 120, maxWidth: 320, resizable: true, skeleton: { type: 'text', width: 'w-24' } }
];
