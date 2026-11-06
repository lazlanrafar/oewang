/**
 * MCP (D106): the account area's tokens and connected apps, and the relay
 * the public `/mcp` route uses.
 *
 * Server only. Tokens belong to a person, so these calls carry the
 * person's session; `relay` instead carries the MCP client's own bearer,
 * which the API looks up by its hash.
 */

import { api } from './api';

export type McpToken = {
	id: string;
	kind: 'pat' | 'oauth';
	name: string;
	client_id: string | null;
	token_prefix: string;
	/** Null reaches every workspace the person belongs to. */
	workspace_ids: string[] | null;
	expires_at: string | null;
	last_used_at: string | null;
	created_at: string;
};

export function listTokens(token?: string) {
	return api<McpToken[]>({ path: '/v1/mcp/tokens', token });
}

export function listConnections(token?: string) {
	return api<McpToken[]>({ path: '/v1/mcp/connections', token });
}

/** The raw token comes back once, as `secret`, and is never readable again. */
export function createToken(
	body: { name: string; workspace_ids: string[] | null; expires_in_days: number | null },
	token?: string
) {
	return api<McpToken & { secret: string }>({
		method: 'POST',
		path: '/v1/mcp/tokens',
		body,
		token
	});
}

export function revokeToken(id: string, token?: string) {
	return api<null>({
		method: 'DELETE',
		path: `/v1/mcp/tokens/${encodeURIComponent(id)}`,
		token
	});
}

/** One JSON-RPC message from an MCP client; null answers a notification. */
export function relay(message: unknown, bearer: string) {
	return api<unknown | null>({ method: 'POST', path: '/v1/mcp', body: message, token: bearer });
}
