import { json } from '@sveltejs/kit';

import { listConsoleUsers } from '$lib/server/console';

import type { RequestHandler } from './$types';

/**
 * The user picker's matches (US-085): the console user list, searched by
 * email or name, without the people who cannot be made operators (those
 * who already are, and disabled accounts). The browser asks here, never
 * the API (D5).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const query = new URLSearchParams({ sort: 'email', order: 'asc', per_page: '20' });
	const search = (url.searchParams.get('search') ?? '').trim();
	if (search) query.set('search', search);

	const users = (await listConsoleUsers(query, locals.accessToken)).data ?? [];
	return json(
		users
			.filter((user) => !user.console_role && !user.disabled_at)
			.map((user) => ({ id: user.id, email: user.email, name: user.name }))
	);
};
