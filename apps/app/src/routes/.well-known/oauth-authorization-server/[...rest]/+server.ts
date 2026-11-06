import type { RequestHandler } from '@sveltejs/kit';

import { authorizationServer, oauthJson, preflight } from '$lib/server/oauth-http';

/** The authorization server's endpoints and what it supports (RFC 8414). */
export const GET: RequestHandler = ({ url }) => oauthJson(authorizationServer(url.origin));
export const OPTIONS: RequestHandler = preflight;
