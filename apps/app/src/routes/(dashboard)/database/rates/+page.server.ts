import * as ledger from '$lib/server/ledger';
import { readParam } from '$lib/url-state';

import type { PageServerLoad } from './$types';

/** A whole snapshot is about 170 rows, so two pages hold all of it. */
const RATES_PAGE_SIZE = 100;

/**
 * The stored daily rate snapshot (FX-1, D96).
 *
 * Search, date, sort and page come out of the URL and go to the API as
 * they are, so a refresh and a pasted link reproduce the view (UI-8, D55).
 * Nothing is filtered or sorted here.
 */
export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const search = (url.searchParams.get('search') ?? '').trim();
	const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') ?? '')
		? (url.searchParams.get('date') as string)
		: '';
	const sort = readParam(url, 'sort', ['code', 'rate'] as const, 'code');
	const order = readParam(url, 'order', ['asc', 'desc'] as const, 'asc');
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const query = new URLSearchParams({ sort, order, limit: String(RATES_PAGE_SIZE) });
	if (search) query.set('search', search);
	if (date) query.set('date', date);

	const [{ me }, result] = await Promise.all([
		parent(),
		ledger.listRates(new URLSearchParams([...query, ['page', String(page)]]), locals.accessToken)
	]);

	return {
		rates: result.data ?? [],
		meta: result.meta,
		home: result.data?.[0]?.home_code ?? me.workspace.currency_code,
		/** What makes this a different list rather than more of the same one. */
		filterKey: query.toString(),
		filtered: search !== '' || date !== ''
	};
};
