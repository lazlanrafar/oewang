import type { DateRange } from '../../molecules/date-range-picker/index.js';

/** One thing that can be filtered on, and the values it accepts. */
export type Facet = {
	id: string;
	label: string;
	options: Array<{ id: string; name: string; colorClass?: string }>;
	/** More than one value at a time. Default true, as the old filter had it. */
	multiple?: boolean;
};

/** Selected facet values, keyed by facet id. */
export type FacetFilters = Record<string, string[]>;

/** An inclusive amount band, as decimal strings (D12). */
export type AmountFilter = { min?: string; max?: string };

export type DataTableFilterState = {
	search: string;
	facets: FacetFilters;
	amount?: AmountFilter;
	dateRange?: DateRange;
};

export const emptyFilterState = (): DataTableFilterState => ({ search: '', facets: {} });

/** Whether anything is actually filtering, which is what the Clear button needs. */
export function hasActiveFilters(state: DataTableFilterState): boolean {
	if (state.search.trim() !== '') return true;
	if (Object.values(state.facets).some((values) => values.length > 0)) return true;
	if (state.amount?.min || state.amount?.max) return true;
	if (state.dateRange?.start) return true;
	return false;
}
