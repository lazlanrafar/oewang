import { createHash, randomBytes } from 'node:crypto';

import { expect, test, type APIRequestContext } from '@playwright/test';

import { actUntil, signIn } from './support';

/**
 * A connector app signing in over OAuth and using `/mcp` (US-061, MCP-9),
 * driven the way claude.ai or ChatGPT drives it: the app's own calls go
 * through a cookieless request context, and only the consent click happens
 * in the person's browser.
 *
 * Also the relay-level evidence for MCP-1 (a JSON-RPC request through the
 * app's `/mcp` to the API and back) and MCP-8 (the 401 that tells a client
 * where to sign in), which no unit test can reach.
 */

/** A loopback redirect, as a desktop or CLI client registers. Nothing
 *  listens there: the test reads the code off the browser's request to it.
 *  (`page.route` does not see a request reached through a redirect.) */
const REDIRECT = 'http://127.0.0.1:33418/callback';

const base64url = (bytes: Buffer) => bytes.toString('base64url');

async function rpc(api: APIRequestContext, token: string, body: object) {
	return api.post('/mcp', {
		headers: {
			authorization: `Bearer ${token}`,
			accept: 'application/json, text/event-stream'
		},
		data: body
	});
}

async function expectRefused(api: APIRequestContext, token: string) {
	const answer = await rpc(api, token, {
		jsonrpc: '2.0',
		id: 9,
		method: 'tools/list'
	});
	expect(answer.status()).toBe(401);
	expect(answer.headers()['www-authenticate']).toMatch(
		/^Bearer resource_metadata=".+\/\.well-known\/oauth-protected-resource"$/
	);
}

test('a connector app signs in with OAuth, uses MCP, and is disconnected', async ({
	page,
	playwright,
	baseURL
}) => {
	// Two sign-ins and a cold dev server can take most of a minute.
	test.setTimeout(90_000);
	// The connector's side: no cookie, no Origin, like a server-side client.
	const app = await playwright.request.newContext({ baseURL });

	// MCP-8: no token, and a token nobody issued, are both a 401 naming
	// the protected-resource metadata.
	const anonymous = await app.post('/mcp', {
		data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }
	});
	expect(anonymous.status()).toBe(401);
	const challenge = anonymous.headers()['www-authenticate'];
	expect(challenge).toBe(
		`Bearer resource_metadata="${baseURL}/.well-known/oauth-protected-resource"`
	);
	await expectRefused(app, 'owm_not-a-real-token');

	// Discovery, from the URL the challenge named.
	const resourceUrl = challenge.match(/resource_metadata="([^"]+)"/)![1];
	const resource = await (await app.get(resourceUrl)).json();
	expect(resource.resource).toBe(`${baseURL}/mcp`);
	expect(await (await app.get('/.well-known/oauth-protected-resource/mcp')).json()).toEqual(
		resource
	);
	const server = await (
		await app.get(`${resource.authorization_servers[0]}/.well-known/oauth-authorization-server`)
	).json();
	expect(server.code_challenge_methods_supported).toEqual(['S256']);
	expect(server.token_endpoint_auth_methods_supported).toEqual(['none']);

	// Dynamic client registration. A foreign plain-http redirect is refused.
	const foreign = await app.post(server.registration_endpoint, {
		data: { client_name: 'Bad', redirect_uris: ['http://evil.example/cb'] }
	});
	expect(foreign.status()).toBe(400);
	const registered = await app.post(server.registration_endpoint, {
		data: {
			client_name: 'E2E Connector',
			redirect_uris: [REDIRECT],
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none'
		}
	});
	expect(registered.status()).toBe(201);
	const { client_id: clientId } = await registered.json();
	expect(clientId).toBeTruthy();

	// The person's side. Signed out, as someone adding a connector often
	// is: the consent URL must survive the trip through the login form.
	// Dropping the cookies rather than using the account menu: the menu's
	// toggle is what makes `signOut` flaky on a cold dev server.
	const account = await signIn(page);
	await page.context().clearCookies();
	const verifier = base64url(randomBytes(32));
	const state = base64url(randomBytes(8));
	const authorize = new URL(server.authorization_endpoint);
	for (const [key, value] of Object.entries({
		response_type: 'code',
		client_id: clientId,
		redirect_uri: REDIRECT,
		code_challenge: base64url(createHash('sha256').update(verifier).digest()),
		code_challenge_method: 'S256',
		state,
		scope: 'mcp',
		resource: resource.resource
	})) {
		authorize.searchParams.set(key, value);
	}

	await page.goto(authorize.toString());
	await expect(page).toHaveURL(/\/login\?next=%2Foauth%2Fauthorize/);
	await page.getByLabel(/email/i).fill(account.email);
	await page.getByLabel('Password', { exact: true }).fill(account.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: /E2E Connector wants to use/ })).toBeVisible();
	expect(new URL(page.url()).searchParams.get('code_challenge')).toBe(
		authorize.searchParams.get('code_challenge')
	);
	const [sent] = await Promise.all([
		page.waitForRequest((request) => request.url().startsWith(REDIRECT)),
		page.getByRole('button', { name: 'Allow' }).click()
	]);
	const callback = new URL(sent.url());
	expect(callback.searchParams.get('state')).toBe(state);
	const code = callback.searchParams.get('code')!;
	expect(code).toBeTruthy();

	// Token exchange, form-encoded as RFC 6749 says.
	const exchanged = await app.post(server.token_endpoint, {
		form: {
			grant_type: 'authorization_code',
			client_id: clientId,
			code,
			redirect_uri: REDIRECT,
			code_verifier: verifier
		}
	});
	expect(exchanged.status()).toBe(200);
	const first = await exchanged.json();
	expect(first.token_type).toMatch(/^bearer$/i);
	expect(first.access_token).toBeTruthy();
	expect(first.refresh_token).toBeTruthy();
	expect(first.expires_in).toBe(3600);

	// The code is single use.
	const again = await app.post(server.token_endpoint, {
		form: {
			grant_type: 'authorization_code',
			client_id: clientId,
			code,
			redirect_uri: REDIRECT,
			code_verifier: verifier
		}
	});
	expect(again.status()).toBe(400);

	// Refresh rotates the pair.
	const refreshed = await app.post(server.token_endpoint, {
		form: {
			grant_type: 'refresh_token',
			client_id: clientId,
			refresh_token: first.refresh_token
		}
	});
	expect(refreshed.status()).toBe(200);
	const tokens = await refreshed.json();
	expect(tokens.access_token).not.toBe(first.access_token);
	expect(tokens.refresh_token).not.toBe(first.refresh_token);

	// MCP-1: the relay, with the access token.
	const init = await rpc(app, tokens.access_token, {
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params: {
			protocolVersion: '2025-06-18',
			capabilities: {},
			clientInfo: { name: 'e2e', version: '1' }
		}
	});
	expect(init.status()).toBe(200);
	expect((await init.json()).result.serverInfo.name).toBe('oewang');

	const initialized = await rpc(app, tokens.access_token, {
		jsonrpc: '2.0',
		method: 'notifications/initialized'
	});
	expect(initialized.status()).toBe(202);

	const listed = await (
		await rpc(app, tokens.access_token, {
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/list'
		})
	).json();
	const names = listed.result.tools.map((tool: { name: string }) => tool.name);
	expect(names).toEqual(expect.arrayContaining(['list_workspaces', 'list_wallets']));

	const called = await (
		await rpc(app, tokens.access_token, {
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: { name: 'list_workspaces', arguments: {} }
		})
	).json();
	expect(called.result.isError).toBe(false);
	expect(called.result.structuredContent.workspaces).toHaveLength(1);
	expect(called.result.structuredContent.workspaces[0].name).toBe('E2E Workspace');

	// The relay speaks only POST, and refuses another site's page.
	expect((await app.get('/mcp')).status()).toBe(405);
	const crossSite = await app.post('/mcp', {
		headers: {
			authorization: `Bearer ${tokens.access_token}`,
			origin: 'https://evil.example'
		},
		data: { jsonrpc: '2.0', id: 4, method: 'tools/list' }
	});
	expect(crossSite.status()).toBe(403);

	// Disconnect in Account, MCP: the access token and the refresh token
	// both stop working at once.
	await page.goto('/account/mcp');
	const dialog = page.getByRole('alertdialog');
	await actUntil(
		() => page.getByRole('button', { name: 'Disconnect' }).click(),
		() => expect(dialog).toBeVisible({ timeout: 1000 })
	);
	await dialog.getByRole('button', { name: 'Disconnect' }).click();
	await expect(page.getByText('No apps connected.')).toBeVisible();

	await expectRefused(app, tokens.access_token);
	const afterDisconnect = await app.post(server.token_endpoint, {
		form: {
			grant_type: 'refresh_token',
			client_id: clientId,
			refresh_token: tokens.refresh_token
		}
	});
	expect(afterDisconnect.status()).toBe(400);

	await app.dispose();
});
