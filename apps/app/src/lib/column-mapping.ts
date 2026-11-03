/**
 * The import wizard's column mapping (TXN-11, AI-9, D28).
 *
 * Step two asks the AI service which column holds what and gets a mapping
 * back. The model never sees a row, so the worst it can do is name a
 * column that is not there, and this module is what stops that reaching
 * the step (docs/features/transactions.md#csv-and-spreadsheet).
 *
 * Pure, and deliberately suspicious of its input: the proposal is model
 * output, which is the same category of thing as a URL.
 */

/** The fields a row is built from, in the order the step renders them. */
export const MAPPING_FIELDS = [
	'date',
	'name',
	'amount',
	'amount_out',
	'amount_in',
	'category',
	'description'
] as const;

export type MappingField = (typeof MAPPING_FIELDS)[number];

export type ColumnMapping = Partial<Record<MappingField, string>>;

/**
 * A proposed mapping, reduced to what the file can support.
 *
 * Three rules, each because the proposal is untrusted:
 *
 * - A key this wizard does not have is dropped. The service may learn a
 *   field before the app does.
 * - A column the file does not have is dropped, matched without regard to
 *   case so a model that answers `date` still maps the file's `Date`. The
 *   file's own spelling is what comes back, because that is the key the
 *   rows are stored under.
 * - A column claimed twice keeps its first field in `MAPPING_FIELDS`
 *   order. One column cannot be both the date and the amount, and a step
 *   that showed it twice would read as a bug in the file.
 */
export function cleanMapping(proposed: unknown, columns: readonly string[]): ColumnMapping {
	if (typeof proposed !== 'object' || proposed === null || Array.isArray(proposed)) return {};

	const byLowercase = new Map(columns.map((column) => [column.toLowerCase(), column]));
	const entries = proposed as Record<string, unknown>;
	const taken = new Set<string>();
	const mapping: ColumnMapping = {};

	for (const field of MAPPING_FIELDS) {
		const value = entries[field];
		if (typeof value !== 'string') continue;

		const column = byLowercase.get(value.trim().toLowerCase());
		if (column === undefined || taken.has(column)) continue;

		taken.add(column);
		mapping[field] = column;
	}

	return mapping;
}

/**
 * Whether the mapping is complete enough to transform rows.
 *
 * A date and a figure. The figure is one signed column or the debit and
 * credit pair most Indonesian bank exports carry, and the sign rule for
 * the pair lives in Rust, not here.
 */
export function isMappable(mapping: ColumnMapping): boolean {
	return !!mapping.date && !!(mapping.amount || mapping.amount_out || mapping.amount_in);
}
