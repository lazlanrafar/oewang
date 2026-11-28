import { error } from '@sveltejs/kit';

import type { LayoutServerLoad } from './$types';

import { ApiError } from '$lib/server/api';
import { listWorkspaces, readWorkspaceMe } from '$lib/server/account';
import * as contactsApi from '$lib/server/contacts';
import * as ledger from '$lib/server/ledger';
import { receiptNotices } from '$lib/server/receipts';
import { workspaceUsage } from '$lib/server/usage';
import { SIDEBAR_COOKIE } from '$lib/components/organisms/layouts';

/**
 * Loaded once per navigation for the whole shell, rather than per page
 * (docs/best-practices/svelte-app.md#route-structure).
 *
 * The guard in hooks.server.ts has already ensured a token exists.
 */
export const load: LayoutServerLoad = async ({ locals, cookies, url }) => {
	/*
	 * The three lists every picker in the shell reads, loaded here rather
	 * than by each page: they are the same lists whatever the page, and a
	 * page that forgot one left a picker empty. Four independent reads, so
	 * one round trip rather than four (docs/best-practices/svelte-app.md).
	 *
	 * All four are called with this session's token, and the workspace is a
	 * claim inside it (AUTH-4): nothing here names one, so no page can be
	 * served another workspace's rows.
	 */
	const shell = Promise.all([
		// A session with no workspace yet is sent to the check page (D109).
		readWorkspaceMe(locals.accessToken, url),
		listWorkspaces(locals.accessToken),
		ledger.listWallets(locals.accessToken),
		ledger.listWalletGroups(locals.accessToken),
		ledger.listCategories(locals.accessToken),
		// The contact picker's list (D80). Never blocks the shell: a failure
		// leaves the picker empty rather than taking every page down.
		contactsApi.pickerContacts(locals.accessToken).catch(() => []),
		// The currency pickers' list, with today's rates (FX-2). A rate
		// source that has never answered leaves it empty, and a picker then
		// offers the workspace's own currencies, so it never blocks the shell.
		ledger.listCurrencies(locals.accessToken).catch(() => null),
		// Queued receipts that ended since the last page (D95). A failure to
		// read them never blocks the shell.
		receiptNotices(locals.accessToken).catch(() => null),
		// The sidebar's usage figures (D92) and the plan that limits them,
		// whose features gate the entry points (PLN-7). Never blocks the
		// shell either: without it nothing is withheld and the API refuses.
		workspaceUsage(locals.accessToken).catch(() => null)
	]);
	const [me, workspaces, wallets, groups, categories, contacts, currencies, notices, usage] = await shell.catch(
		(caught: unknown) => {
			// An operator suspended this workspace (CSL-5): the API refuses every
			// read in it. The error page says so and offers another workspace.
			if (caught instanceof ApiError && caught.code === 'WORKSPACE_SUSPENDED') {
				error(403, 'WORKSPACE_SUSPENDED');
			}
			throw caught;
		}
	);

	// The sidebar's own state, read here so the first paint is already the
	// shape the reader left it in. Rendering it open and collapsing it in the
	// browser is a visible jump on every navigation. The live app keeps the
	// same cookie under the same name.
	return {
		me,
		// The switcher's list (WS-1, D94).
		workspaces: (workspaces.data ?? []).map((workspace) => ({
			id: workspace.id,
			name: workspace.name,
			role: workspace.role
		})),
		lists: {
			wallets: (wallets.data ?? []).map((wallet) => ({
				id: wallet.id,
				name: wallet.name,
				currency_code: wallet.currency_code
			})),
			groups: (groups.data ?? []).map((group) => ({ id: group.id, name: group.name })),
			categories: (categories.data ?? []).map((category) => ({
				id: category.id,
				name: category.name,
				type: category.type
			})),
			contacts,
			currencies: (currencies?.data ?? []).map((currency) => ({
				code: currency.currency_code,
				rate: currency.rate,
				date: currency.date
			}))
		},
		receiptNotices: notices?.data ?? [],
		usage: usage?.data
			? {
					tokens: usage.data.ai.month.input + usage.data.ai.month.output,
					bytes: usage.data.storage.bytes,
					files: usage.data.storage.files,
					plan: {
						name: usage.data.plan.name,
						max_tokens_month: usage.data.plan.max_tokens_month,
						max_storage_bytes: usage.data.plan.max_storage_bytes,
						features: usage.data.plan.features
					}
				}
			: null,
		sidebarOpen: cookies.get(SIDEBAR_COOKIE) !== 'false'
	};
};
