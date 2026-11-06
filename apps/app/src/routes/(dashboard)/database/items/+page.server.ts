import * as ledger from '$lib/server/ledger';
import { readParam } from '$lib/url-state';

import type { PageServerLoad } from './$types';

const ITEMS_PAGE_SIZE = 50;

const SORTS = ['last_bought_at', 'name', 'purchases', 'last_price'] as const;

/**
 * Every item bought, and the open item's price history (ITM-1, ITM-2).
 *
 * The search, the sort, the page and the open item (`?item=`) all live in
 * the URL, so a refresh keeps the sheet open and a link reproduces it
 * (UI-8, D55). The history is read here, not from the browser (D5).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const token = locals.accessToken;
	const search = (url.searchParams.get('search') ?? '').trim();
	const sort = readParam(url, 'sort', SORTS, 'last_bought_at');
	const order = readParam(
		url,
		'order',
		['asc', 'desc'] as const,
		sort === 'last_bought_at' ? 'desc' : 'asc'
	);
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const query = new URLSearchParams({ sort, order, limit: String(ITEMS_PAGE_SIZE) });
	if (search) query.set('search', search);

	const [items, open] = await Promise.all([
		ledger.listItems(new URLSearchParams([...query, ['page', String(page)]]), token),
		loadItem(url.searchParams.get('item'), token)
	]);

	return {
		items: items.data ?? [],
		meta: items.meta,
		open,
		/** What makes this a different list rather than more of the same one. */
		filterKey: query.toString(),
		filtered: search !== ''
	};
};

/**
 * The item a row opened: its summary and its newest purchases. `?item=` is
 * the row id, `{currency}:{key}`. One that matches nothing opens nothing.
 */
async function loadItem(id: string | null, token?: string) {
	const split = id?.indexOf(':') ?? -1;
	if (!id || split !== 3) return null;
	const currency = id.slice(0, split);
	const key = id.slice(split + 1);

	const summary = new URLSearchParams({ key, currency, limit: '1' });
	const [item, history] = await Promise.all([
		ledger.listItems(summary, token),
		ledger.itemHistory(key, currency, 1, token)
	]);
	const found = item.data?.[0];
	if (!found) return null;

	return {
		item: found,
		purchases: history.data ?? [],
		total: history.meta.total ?? history.data?.length ?? 0
	};
}
