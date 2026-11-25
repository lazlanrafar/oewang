import { listConsoleAudit } from '$lib/server/console';

import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

/** The operator audit (CSL-12, US-085): newest first, the page in the URL. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const entries = await listConsoleAudit(
		new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE) }),
		locals.accessToken
	);
	return { entries: entries.data ?? [], meta: entries.meta };
};
