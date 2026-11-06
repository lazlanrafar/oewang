import type { LayoutServerLoad } from './$types';

import { listWorkspaces, readWorkspaceMe } from '$lib/server/account';
import * as ledger from '$lib/server/ledger';
import { receiptNotices } from '$lib/server/receipts';
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
	const [me, workspaces, wallets, groups, categories, currencies, notices] = await Promise.all([
		// A session with no workspace yet is sent to the check page (D109).
		readWorkspaceMe(locals.accessToken, url),
		listWorkspaces(locals.accessToken),
		ledger.listWallets(locals.accessToken),
		ledger.listWalletGroups(locals.accessToken),
		ledger.listCategories(locals.accessToken),
		// The currency pickers' list, with today's rates (FX-2). A rate
		// source that has never answered leaves it empty, and a picker then
		// offers the workspace's own currencies, so it never blocks the shell.
		ledger.listCurrencies(locals.accessToken).catch(() => null),
		// Queued receipts that ended since the last page (D95). A failure to
		// read them never blocks the shell.
		receiptNotices(locals.accessToken).catch(() => null)
	]);

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
			currencies: (currencies?.data ?? []).map((currency) => ({
				code: currency.currency_code,
				rate: currency.rate,
				date: currency.date
			}))
		},
		receiptNotices: notices?.data ?? [],
		sidebarOpen: cookies.get(SIDEBAR_COOKIE) !== 'false'
	};
};
