import { WORKSPACE_STATUSES } from '$lib/console';
import * as consoleApi from '$lib/server/console';
import { run, text } from '$lib/server/form-action';
import { readParam, readValues } from '$lib/url-state';

import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 50;

/**
 * The console's workspaces (CSL-4, US-081).
 *
 * The search, the status, the sort, the page and the open workspace
 * (`?workspace=`) live in the URL (UI-8, D55), so a user's membership list
 * can link to one workspace. No status means all three, as the API has it.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const token = locals.accessToken;
	const search = (url.searchParams.get('search') ?? '').trim();
	const status = readValues(url, 'status').find((value) => (WORKSPACE_STATUSES as readonly string[]).includes(value));
	const sort = readParam(url, 'sort', ['created_at', 'name'] as const, 'created_at');
	const order = readParam(url, 'order', ['asc', 'desc'] as const, 'desc');
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const query = new URLSearchParams({ sort, order, per_page: String(PAGE_SIZE) });
	if (search) query.set('search', search);
	if (status) query.set('status', status);

	const openId = url.searchParams.get('workspace');

	const [workspaces, open] = await Promise.all([
		consoleApi.listConsoleWorkspaces(new URLSearchParams([...query, ['page', String(page)]]), token),
		openId ? consoleApi.consoleWorkspace(openId, token) : null
	]);

	return {
		workspaces: workspaces.data ?? [],
		meta: workspaces.meta,
		open,
		filterKey: query.toString(),
		filtered: search !== '' || status !== undefined
	};
};

/** Suspend, unsuspend and restore (CSL-5, CSL-6, US-082). The API checks the permission. */
export const actions: Actions = {
	suspend: async ({ request, locals }) =>
		run(request, (form) => consoleApi.actOnWorkspace(text(form, 'id'), 'suspend', locals.accessToken)),

	unsuspend: async ({ request, locals }) =>
		run(request, (form) => consoleApi.actOnWorkspace(text(form, 'id'), 'unsuspend', locals.accessToken)),

	restore: async ({ request, locals }) =>
		run(request, (form) => consoleApi.actOnWorkspace(text(form, 'id'), 'restore', locals.accessToken))
};
