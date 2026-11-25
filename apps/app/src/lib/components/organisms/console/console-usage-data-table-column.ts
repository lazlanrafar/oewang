/**
 * The usage page's three tables (CSL-10, US-084): one month's tokens and
 * calls by workspace, by model and by feature. The API orders each, so
 * no column sorts.
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

const FIGURES: ColumnSpec[] = [
	{ key: 'input', label: 'Input', width: 140, minWidth: 100, maxWidth: 220, resizable: true, alignRight: true, skeleton: { type: 'text', width: 'w-16' } },
	{ key: 'output', label: 'Output', width: 140, minWidth: 100, maxWidth: 220, resizable: true, alignRight: true, skeleton: { type: 'text', width: 'w-16' } },
	{ key: 'calls', label: 'Calls', width: 120, minWidth: 90, maxWidth: 200, resizable: true, alignRight: true, skeleton: { type: 'text', width: 'w-12' } }
];

const first = (key: string, label: string): ColumnSpec => ({
	key,
	label,
	width: 260,
	minWidth: 150,
	maxWidth: 440,
	stickyLeft: true,
	resizable: true,
	skeleton: { type: 'text', width: 'w-32' }
});

export const CONSOLE_USAGE_COLUMNS = {
	workspace: [first('name', 'Workspace'), ...FIGURES],
	model: [first('name', 'Model'), ...FIGURES],
	feature: [first('name', 'Feature'), ...FIGURES]
} satisfies Record<string, ColumnSpec[]>;
