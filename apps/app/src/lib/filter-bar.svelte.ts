/**
 * The filter bar's state, kept in the URL (UI-8, D55).
 *
 * Every list screen searches with `molecules/data-table-filter`, the
 * transactions page's bar, and offers whatever facets its table can be
 * narrowed by. This is the wiring every such page would otherwise copy: the
 * bar is seeded from the query string, and a change is written back to it,
 * the search after a pause in typing and a facet at once.
 *
 * Call it once, during component setup, because it registers effects:
 *
 *     const bar = filterBar({ group: 'group_id', currency: 'currency' });
 *     <DataTableFilter bind:filters={bar.filters} ... />
 *
 * `facets` maps a facet id to the query parameter that carries it. A
 * paged list passes `resetPage`, so a new filter starts from page one.
 *
 * The transactions page keeps its own copy: it also carries the amount
 * band and leaves the date to its own picker.
 */
import { page } from '$app/state';

import {
	emptyFilterState,
	type DataTableFilterState
} from '$lib/components/molecules/data-table-filter';
import { readText, readValues, writeParams } from '$lib/url-state';

export function filterBar(
	facets: Record<string, string> = {},
	options: { resetPage?: boolean } = {}
) {
	let filters = $state<DataTableFilterState>(emptyFilterState());
	let timer: ReturnType<typeof setTimeout> | undefined;

	// The URL is the source of truth: a navigation, the back button or a
	// pasted link all land here.
	$effect(() => {
		filters = {
			search: readText(page.url, 'search'),
			facets: Object.fromEntries(
				Object.entries(facets).map(([facet, key]) => [facet, readValues(page.url, key)])
			)
		};
	});

	$effect(() => {
		const wanted: Record<string, string | string[]> = { search: filters.search };
		for (const [facet, key] of Object.entries(facets)) {
			wanted[key] = filters.facets[facet] ?? [];
		}

		// Nothing to write unless a filter actually moved: this runs on every
		// navigation, and an unconditional write would also reset the page.
		const unchanged = Object.entries(wanted).every(([key, value]) =>
			Array.isArray(value)
				? value.join('\u0000') === readValues(page.url, key).join('\u0000')
				: value === readText(page.url, key)
		);
		if (unchanged) return;

		clearTimeout(timer);
		const typing = wanted.search !== readText(page.url, 'search');
		timer = setTimeout(
			() => writeParams(options.resetPage ? { ...wanted, page: null } : wanted),
			typing ? 300 : 0
		);
	});

	return {
		get filters() {
			return filters;
		},
		set filters(next: DataTableFilterState) {
			filters = next;
		}
	};
}
