import type { LayoutServerLoad } from './$types';

import { api } from '$lib/server/api';
import * as ledger from '$lib/server/ledger';
import { SIDEBAR_COOKIE } from '$lib/components/organisms/layouts';

type Me = {
	user: { id: string; email: string; name: string | null };
	workspace: { id: string; name: string; slug: string; currency_code: string };
	role: 'owner' | 'admin' | 'member';
};

/**
 * Loaded once per navigation for the whole shell, rather than per page
 * (docs/best-practices/svelte-app.md#route-structure).
 *
 * The guard in hooks.server.ts has already ensured a token exists.
 */
export const load: LayoutServerLoad = async ({ locals, cookies }) => {
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
	const [result, wallets, groups, categories] = await Promise.all([
		api<Me>({ path: '/v1/auth/me', token: locals.accessToken }),
		ledger.listWallets(locals.accessToken),
		ledger.listWalletGroups(locals.accessToken),
		ledger.listCategories(locals.accessToken)
	]);

	// The sidebar's own state, read here so the first paint is already the
	// shape the reader left it in. Rendering it open and collapsing it in the
	// browser is a visible jump on every navigation. The live app keeps the
	// same cookie under the same name.
	return {
		me: result.data!,
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
			}))
		},
		sidebarOpen: cookies.get(SIDEBAR_COOKIE) !== 'false'
	};
};
