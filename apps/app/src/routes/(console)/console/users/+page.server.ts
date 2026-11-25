import * as consoleApi from '$lib/server/console';
import { run, text } from '$lib/server/form-action';
import { readParam } from '$lib/url-state';

import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 50;

/**
 * The console's users (CSL-3, US-081).
 *
 * The search, the sort, the page and the open user (`?user=`) live in the
 * URL (UI-8, D55), so a workspace's member list can link to one user.
 * Newest first unless the URL says otherwise, as the API defaults.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const token = locals.accessToken;
	const search = (url.searchParams.get('search') ?? '').trim();
	const sort = readParam(url, 'sort', ['created_at', 'email'] as const, 'created_at');
	const order = readParam(url, 'order', ['asc', 'desc'] as const, 'desc');
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const query = new URLSearchParams({ sort, order, per_page: String(PAGE_SIZE) });
	if (search) query.set('search', search);

	const openId = url.searchParams.get('user');

	const [users, open] = await Promise.all([
		consoleApi.listConsoleUsers(new URLSearchParams([...query, ['page', String(page)]]), token),
		openId ? consoleApi.consoleUser(openId, token) : null
	]);

	return {
		users: users.data ?? [],
		meta: users.meta,
		open,
		filterKey: query.toString(),
		filtered: search !== ''
	};
};

/** Disable and enable (CSL-7, US-082). The API checks the permission and refuses an operator. */
export const actions: Actions = {
	disable: async ({ request, locals }) =>
		run(request, (form) => consoleApi.actOnUser(text(form, 'id'), 'disable', locals.accessToken)),

	enable: async ({ request, locals }) =>
		run(request, (form) => consoleApi.actOnUser(text(form, 'id'), 'enable', locals.accessToken))
};
