import type { RequestHandler } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { registerClient } from '$lib/server/mcp';
import { oauthJson, preflight } from '$lib/server/oauth-http';

/**
 * Dynamic client registration (RFC 7591) for MCP connector apps. The API
 * validates and stores; this answers in the RFC's shape: 201 with the
 * client, or 400 with `{ error, error_description }`.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return oauthJson({ error: 'invalid_client_metadata', error_description: 'Send JSON.' }, 400);
	}
	let answer: Record<string, unknown>;
	try {
		answer = (await registerClient(body)).data ?? {};
	} catch (error) {
		if (error instanceof ApiError) {
			return oauthJson({ error: 'invalid_client_metadata', error_description: error.message }, 400);
		}
		throw error;
	}
	return 'error' in answer ? oauthJson(answer, 400) : oauthJson(answer, 201);
};

export const OPTIONS: RequestHandler = preflight;
