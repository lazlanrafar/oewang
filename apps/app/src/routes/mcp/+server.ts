import { json, type RequestHandler } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { relay } from '$lib/server/mcp';

/**
 * The MCP endpoint external AI clients connect to (D106): Streamable HTTP,
 * stateless, one JSON-RPC message per POST and one JSON answer back.
 *
 * It holds no rule. The bearer and the message go to the API over OWE1 like
 * any other call (D5, D22); the API looks the token up, re-reads the
 * membership and runs the web's own handlers. This route only speaks HTTP
 * to the client: a refused token is a 401 with the header that tells an
 * OAuth-capable client where to sign in, and a notification is a 202.
 */

function unauthorized(origin: string) {
	return new Response(
		JSON.stringify({ error: 'invalid_token', error_description: 'Missing or invalid token.' }),
		{
			status: 401,
			headers: {
				'content-type': 'application/json',
				'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`
			}
		}
	);
}

export const POST: RequestHandler = async ({ request, url }) => {
	// A browser page on another site must not drive this endpoint with the
	// user's network position (DNS rebinding); clients send no Origin.
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) {
		return new Response('Forbidden origin', { status: 403 });
	}

	const bearer = request.headers
		.get('authorization')
		?.match(/^Bearer\s+(.+)$/i)?.[1]
		?.trim();
	if (!bearer) return unauthorized(url.origin);

	let message: unknown;
	try {
		message = await request.json();
	} catch {
		return json(
			{ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
			{ status: 400 }
		);
	}
	if (Array.isArray(message)) {
		return json(
			{ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batches are not supported' } },
			{ status: 400 }
		);
	}

	try {
		const answer = (await relay(message, bearer)).data ?? null;
		return answer === null ? new Response(null, { status: 202 }) : json(answer);
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) return unauthorized(url.origin);
		if (error instanceof ApiError && error.status === 429) {
			return json(
				{ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Too many requests' } },
				{ status: 429 }
			);
		}
		throw error;
	}
};

/** No server-sent stream: every answer comes back on its POST. */
export const GET: RequestHandler = () =>
	new Response(null, { status: 405, headers: { allow: 'POST' } });

export const DELETE: RequestHandler = GET;
