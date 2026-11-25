import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accessAllowed, hostServes, resetAccessKeys } from './console';

const TEAM = 'oewang.cloudflareaccess.com';
const AUD = 'aud-console';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function token(claims: Record<string, unknown>, kid = 'k1', key = privateKey) {
	const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const head = part({ alg: 'RS256', kid });
	const body = part({
		aud: [AUD],
		iss: `https://${TEAM}`,
		exp: Math.floor(Date.now() / 1000) + 60,
		...claims
	});
	const signature = sign('sha256', Buffer.from(`${head}.${body}`), key).toString('base64url');
	return `${head}.${body}.${signature}`;
}

function headers(value?: string) {
	return new Headers(value ? { 'cf-access-jwt-assertion': value } : {});
}

// CSL-1
describe('hostServes', () => {
	it('should serve the console only on the console host', () => {
		expect(hostServes(true, '/console')).toBe(true);
		expect(hostServes(true, '/console/users')).toBe(true);
		expect(hostServes(false, '/console')).toBe(false);
		expect(hostServes(false, '/console/users')).toBe(false);
	});

	it('should serve nothing but the console and sign-in on the console host', () => {
		expect(hostServes(true, '/transactions')).toBe(false);
		expect(hostServes(true, '/register')).toBe(false);
		expect(hostServes(true, '/mcp')).toBe(false);
		expect(hostServes(true, '/consoles')).toBe(false);
		for (const shared of ['/login', '/logout', '/health']) {
			expect(hostServes(true, shared)).toBe(true);
			expect(hostServes(false, shared)).toBe(true);
		}
		expect(hostServes(false, '/transactions')).toBe(true);
	});
});

// CSL-1, D124
describe('accessAllowed', () => {
	beforeEach(() => {
		resetAccessKeys();
		vi.stubEnv('APP_ENV', 'production');
		vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', TEAM);
		vi.stubEnv('CF_ACCESS_AUD', AUD);
		const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' };
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] })))
		);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('should accept a token Cloudflare signed for this application', async () => {
		expect(await accessAllowed(headers(token({})))).toBe(true);
	});

	it('should refuse a missing, foreign, expired or forged token', async () => {
		const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
		expect(await accessAllowed(headers())).toBe(false);
		expect(await accessAllowed(headers(token({ aud: ['another-app'] })))).toBe(false);
		expect(await accessAllowed(headers(token({ iss: 'https://evil.example' })))).toBe(false);
		expect(await accessAllowed(headers(token({ exp: 1 })))).toBe(false);
		expect(await accessAllowed(headers(token({}, 'k1', other)))).toBe(false);
		expect(await accessAllowed(headers(token({}, 'unknown')))).toBe(false);
		expect(await accessAllowed(headers('not-a-jwt'))).toBe(false);
	});

	it('should refuse everything when Access is not configured outside development', async () => {
		vi.stubEnv('CF_ACCESS_AUD', '');
		expect(await accessAllowed(headers(token({})))).toBe(false);
	});

	it('should not ask for Access in development', async () => {
		vi.stubEnv('APP_ENV', 'development');
		expect(await accessAllowed(headers())).toBe(true);
	});
});
