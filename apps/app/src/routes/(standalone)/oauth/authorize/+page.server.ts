import { fail, redirect, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { authorizeClient, getClient, type OAuthClient } from '$lib/server/mcp';

import type { PageServerLoad } from './$types';

/**
 * The consent page for MCP connector apps (D106, MCP-9).
 *
 * Signed out, the hook sends the person to sign in and back here. Then the
 * request is checked before anything else: the client must exist and the
 * redirect URI must be one it registered, exactly. Until both hold, this
 * page never redirects anywhere, because an unchecked redirect URI is how
 * a code gets stolen. After that, a malformed request goes back to the app
 * as an OAuth error, as RFC 6749 says.
 */

type Params = {
	client_id: string;
	redirect_uri: string;
	code_challenge: string;
	code_challenge_method: string;
	state: string;
	response_type: string;
};

function params(source: URLSearchParams | FormData): Params {
	const read = (key: string) => String(source.get(key) ?? '').trim();
	return {
		client_id: read('client_id'),
		redirect_uri: read('redirect_uri'),
		code_challenge: read('code_challenge'),
		code_challenge_method: read('code_challenge_method'),
		state: read('state'),
		response_type: read('response_type')
	};
}

/** The registered client, or null when the request names none we trust. */
async function trusted(request: Params, token?: string): Promise<OAuthClient | null> {
	if (!request.client_id || !request.redirect_uri) return null;
	try {
		const client = (await getClient(request.client_id, token)).data ?? null;
		return client && client.redirect_uris.includes(request.redirect_uri) ? client : null;
	} catch (error) {
		if (error instanceof ApiError && error.status === 404) return null;
		throw error;
	}
}

/** Back to the app, with the code or the error, and its own `state`. */
function back(request: Params, values: Record<string, string>): never {
	const target = new URL(request.redirect_uri);
	for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value);
	if (request.state) target.searchParams.set('state', request.state);
	redirect(303, target.toString());
}

export const load: PageServerLoad = async ({ url, locals, setHeaders }) => {
	// Never framed: a consent click must be the person's own.
	setHeaders({ 'content-security-policy': "frame-ancestors 'none'", 'x-frame-options': 'DENY' });

	const request = params(url.searchParams);
	const client = await trusted(request, locals.accessToken);
	if (!client) return { invalid: true as const };

	if (request.response_type !== 'code') {
		back(request, { error: 'unsupported_response_type' });
	}
	if (!request.code_challenge || request.code_challenge_method !== 'S256') {
		back(request, { error: 'invalid_request', error_description: 'PKCE S256 is required.' });
	}

	return {
		invalid: false as const,
		client: { name: client.client_name, host: new URL(request.redirect_uri).host || request.redirect_uri },
		request
	};
};

export const actions: Actions = {
	allow: async ({ request: http, locals }) => {
		const form = await http.formData();
		const request = params(form);
		if (!(await trusted(request, locals.accessToken))) return fail(400, { code: 'VALIDATION_FAILED', fields: {} as Record<string, string> });

		const workspaceIds = form.getAll('workspace_ids').map(String).filter(Boolean);
		let code: string;
		try {
			code = (
				await authorizeClient(
					{
						client_id: request.client_id,
						redirect_uri: request.redirect_uri,
						code_challenge: request.code_challenge,
						code_challenge_method: request.code_challenge_method,
						workspace_ids: String(form.get('scope')) === 'some' ? workspaceIds : null
					},
					locals.accessToken
				)
			).data!.code;
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, { code: error.code, fields: error.fields });
			}
			throw error;
		}
		back(request, { code });
	},

	deny: async ({ request: http, locals }) => {
		const request = params(await http.formData());
		if (!(await trusted(request, locals.accessToken))) return fail(400, { code: 'VALIDATION_FAILED', fields: {} as Record<string, string> });
		back(request, { error: 'access_denied' });
	}
};
