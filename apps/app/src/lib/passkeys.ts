/**
 * Passkey ceremonies, from the browser's side (D110).
 *
 * Each is two calls to this app's own server routes with the authenticator
 * prompt between them; the browser never talks to the API (D5). Signing in
 * and adding a passkey run the same shape, so it is written once here.
 */

import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration
} from '@simplewebauthn/browser';

/**
 * How a ceremony ended. `cancelled` is the person closing the prompt,
 * which needs no message; `code` is an API error code, or null when the
 * authenticator itself failed.
 */
export type PasskeyOutcome<T> =
	| { status: 'ok'; data: T }
	| { status: 'cancelled' }
	| { status: 'failed'; code: string | null };

export function passkeysSupported(): boolean {
	return browserSupportsWebAuthn();
}

/** Sign in with any passkey this browser holds for the site. */
export function signInWithPasskey(next: string) {
	return ceremony<{ location: string }>(
		'/login/passkey/start',
		'/login/passkey/finish',
		(optionsJSON) => startAuthentication({ optionsJSON: optionsJSON as never }),
		{ next }
	);
}

/** Make a passkey on this device for the signed-in person. */
export function addPasskey(name: string) {
	return ceremony<unknown>(
		'/account/security/passkeys/start',
		'/account/security/passkeys/finish',
		(optionsJSON) => startRegistration({ optionsJSON: optionsJSON as never }),
		{ name }
	);
}

async function ceremony<T>(
	startUrl: string,
	finishUrl: string,
	prompt: (options: unknown) => Promise<unknown>,
	extra: Record<string, unknown>
): Promise<PasskeyOutcome<T>> {
	const started = await post(startUrl, {});
	if (!started.ok) return { status: 'failed', code: started.code };
	const { ceremony_id, options } = started.data as { ceremony_id: string; options: unknown };

	let credential: unknown;
	try {
		credential = await prompt(options);
	} catch (error) {
		// Closing the prompt, or letting it time out, is a choice, not an error.
		const name = error instanceof Error ? error.name : '';
		const code = (error as { code?: string } | null)?.code;
		if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') {
			return { status: 'cancelled' };
		}
		return { status: 'failed', code: null };
	}

	const finished = await post(finishUrl, { ceremony_id, credential, ...extra });
	return finished.ok
		? { status: 'ok', data: finished.data as T }
		: { status: 'failed', code: finished.code };
}

async function post(
	url: string,
	body: unknown
): Promise<{ ok: true; data: unknown } | { ok: false; code: string | null }> {
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await response.json().catch(() => null);
		return response.ok ? { ok: true, data } : { ok: false, code: data?.code ?? null };
	} catch {
		return { ok: false, code: null };
	}
}
