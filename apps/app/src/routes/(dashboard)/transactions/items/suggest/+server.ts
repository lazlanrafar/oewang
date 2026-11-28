import { json } from '@sveltejs/kit';

import { listItems } from '$lib/server/ledger';

import type { RequestHandler } from './$types';

/**
 * The line item form's name suggestions: the workspace's items (ITM-1),
 * most recently bought first, searched by name. The browser asks here,
 * never the API (D5).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const query = new URLSearchParams({ sort: 'last_bought_at', order: 'desc', limit: '20' });
	const search = (url.searchParams.get('search') ?? '').trim();
	if (search) query.set('search', search);

	const items = (await listItems(query, locals.accessToken)).data ?? [];
	// One row per name and currency upstream; the form only wants the name.
	return json([...new Set(items.map((item) => item.name))]);
};
