import type { LayoutServerLoad } from './$types';

import { api } from '$lib/server/api';
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
	const result = await api<Me>({ path: '/v1/auth/me', token: locals.accessToken });

	// The sidebar's own state, read here so the first paint is already the
	// shape the reader left it in. Rendering it open and collapsing it in the
	// browser is a visible jump on every navigation. The live app keeps the
	// same cookie under the same name.
	return { me: result.data!, sidebarOpen: cookies.get(SIDEBAR_COOKIE) !== 'false' };
};
