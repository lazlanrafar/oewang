import type { RequestHandler } from '@sveltejs/kit';

import { oauthJson, preflight, protectedResource } from '$lib/server/oauth-http';

/**
 * Which authorization server guards `/mcp` (RFC 9728). Served at the bare
 * path and with the resource path appended, because clients ask for both.
 */
export const GET: RequestHandler = ({ url }) => oauthJson(protectedResource(url.origin));
export const OPTIONS: RequestHandler = preflight;
