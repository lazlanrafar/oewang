/**
 * The workspace's own lists, loaded once for the shell and read by the
 * pickers.
 *
 * A picker over accounts, groups or categories is always picking from the
 * same three lists, and passing them down from every page meant the same
 * three `$derived` maps written at each call site. They live here instead:
 * the dashboard layout loads them with the session's token and publishes
 * them through context, and a picker that is given no list reads this one.
 *
 * **Whose data this is.** The lists come from the layout's server load,
 * which calls the API with the cookie's token. The workspace is a claim
 * inside that token (AUTH-4); nothing the browser sends names a workspace,
 * and nothing here can ask for another one. The same holds for the create
 * calls below: they post a name, and the server decides where it lands. A
 * second workspace means a second session, a second load and a second
 * context, so two workspaces' rows never meet.
 *
 * The browser still never talks to the API (D5): the create calls post to
 * this app's own `/workspace` route, which is what holds the token.
 */
import { getContext, setContext } from 'svelte';

import { invalidateAll } from '$app/navigation';

export type WorkspaceWallet = { id: string; name: string; currency_code: string };
export type WorkspaceGroup = { id: string; name: string };
export type WorkspaceCategory = { id: string; name: string; type: 'income' | 'expense' };
/**
 * A currency the pickers offer, from the newest daily snapshot (FX-2,
 * D96). `rate` is one unit of it in the workspace currency, a decimal
 * string; the workspace's own is first, at one.
 */
export type WorkspaceCurrency = { code: string; rate: string; date: string };

export type WorkspaceLists = {
	wallets: WorkspaceWallet[];
	groups: WorkspaceGroup[];
	categories: WorkspaceCategory[];
	currencies: WorkspaceCurrency[];
};

const KEY = Symbol('workspace-lists');

/**
 * Published by the dashboard layout. A getter rather than a snapshot, so a
 * navigation that reloads the lists reaches every picker already on screen.
 */
export function setWorkspaceLists(lists: () => WorkspaceLists) {
	setContext(KEY, lists);
}

/**
 * The lists, or empty ones outside the dashboard.
 *
 * Empty rather than thrown: the design system renders these components on a
 * bare page with no layout above them, and a specimen passing its own list
 * should not have to satisfy a context it never uses.
 */
export function workspaceLists(): WorkspaceLists {
	const read = getContext<(() => WorkspaceLists) | undefined>(KEY);
	return read?.() ?? { wallets: [], groups: [], categories: [], currencies: [] };
}

type Created = { id: string; name: string };

async function create(body: Record<string, string>): Promise<Created | undefined> {
	const response = await fetch('/workspace', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!response.ok) return undefined;

	const created = (await response.json()) as Created;
	// The new row has to reach the lists, and they are a server load.
	await invalidateAll();
	return created;
}

/** Create from inside a picker, in the workspace the session is signed in to. */
export const createInWorkspace = {
	wallet: (name: string) => create({ kind: 'wallet', name }),
	group: (name: string) => create({ kind: 'group', name }),
	category: (name: string, type: 'income' | 'expense') =>
		create({ kind: 'category', name, type })
};
