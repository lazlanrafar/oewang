import type { RequestHandler } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { exchangeToken } from '$lib/server/mcp';
import { oauthJson, preflight } from '$lib/server/oauth-http';

/**
 * The token endpoint (RFC 6749): a code with its PKCE verifier, or a
 * refresh token. Form-encoded as the RFC says; JSON accepted too, since
 * some clients send it.
 */
export const POST: RequestHandler = async ({ request }) => {
	const type = request.headers.get('content-type') ?? '';
	let fields: Record<string, string>;
	try {
		fields = type.includes('application/json')
			? await request.json()
			: Object.fromEntries(new URLSearchParams(await request.text()));
	} catch {
		return oauthJson({ error: 'invalid_request', error_description: 'Unreadable body.' }, 400);
	}

	let answer: Record<string, unknown>;
	try {
		answer = (
			await exchangeToken({
				grant_type: fields.grant_type,
				client_id: fields.client_id,
				code: fields.code,
				redirect_uri: fields.redirect_uri,
				code_verifier: fields.code_verifier,
				refresh_token: fields.refresh_token
			})
		).data ?? {};
	} catch (error) {
		if (error instanceof ApiError) {
			return oauthJson({ error: 'invalid_request', error_description: error.message }, 400);
		}
		throw error;
	}
	return 'error' in answer ? oauthJson(answer, 400) : oauthJson(answer);
};

export const OPTIONS: RequestHandler = preflight;
