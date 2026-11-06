/**
 * HTTP for the OAuth endpoints MCP connector apps call (D106, MCP-9).
 *
 * These answers go to apps, not browsers of this site: JSON, never cached,
 * and readable cross-origin because they carry no cookie and no secret of
 * anyone but the caller.
 */
import { json } from '@sveltejs/kit';

export const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, OPTIONS',
	'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version'
};

export function oauthJson(body: unknown, status = 200) {
	return json(body, { status, headers: { ...CORS, 'cache-control': 'no-store' } });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });

/** Metadata for discovery (RFC 8414, RFC 9728), from the request's origin. */
export function authorizationServer(origin: string) {
	return {
		issuer: origin,
		authorization_endpoint: `${origin}/oauth/authorize`,
		token_endpoint: `${origin}/oauth/token`,
		registration_endpoint: `${origin}/oauth/register`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		scopes_supported: ['mcp']
	};
}

export function protectedResource(origin: string) {
	return {
		resource: `${origin}/mcp`,
		authorization_servers: [origin],
		bearer_methods_supported: ['header'],
		scopes_supported: ['mcp'],
		resource_name: 'oewang'
	};
}
