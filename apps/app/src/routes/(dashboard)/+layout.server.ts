import type { LayoutServerLoad } from './$types';

import { api } from '$lib/server/api';

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
export const load: LayoutServerLoad = async ({ locals }) => {
	const result = await api<Me>({ path: '/v1/auth/me', token: locals.accessToken });
	return { me: result.data! };
};
