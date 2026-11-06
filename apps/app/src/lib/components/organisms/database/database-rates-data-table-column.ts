/**
 * The rates table's columns (FX-1). Same row height and `ColumnSpec` shape
 * as every other list, so the Database screens read as the same table.
 *
 * Labels here are fallbacks for the column menu; the header renders the
 * translated, currency-aware label (UI-1).
 */
import type { ColumnSpec } from '$lib/components/molecules/data-table';

export type RateSortKey = 'code' | 'rate';

export const RATE_COLUMNS: ColumnSpec[] = [
	{ key: 'code', label: 'Currency', width: 160, minWidth: 120, maxWidth: 240, stickyLeft: true, resizable: true, sortable: true },
	{ key: 'rate', label: 'Rate', width: 220, minWidth: 140, maxWidth: 320, resizable: true, sortable: true, alignRight: true },
	{ key: 'inverse', label: 'Inverse', width: 220, minWidth: 140, maxWidth: 320, resizable: true, alignRight: true },
	{ key: 'date', label: 'Snapshot', width: 200, minWidth: 140, maxWidth: 320, resizable: true }
];
