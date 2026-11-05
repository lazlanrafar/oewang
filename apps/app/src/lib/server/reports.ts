/**
 * Typed calls to the report endpoints (D87).
 *
 * Server only, like everything under `src/lib/server`: the browser never
 * talks to the API (D5).
 */

import type { Overview } from '$lib/reports';

import { api } from './api';

/** The overview page's figures for a range of days, both ends inclusive. */
export function overview(from: string, to: string, token?: string) {
	return api<Overview>({
		path: '/v1/overview',
		query: new URLSearchParams({ from, to }),
		token
	});
}
