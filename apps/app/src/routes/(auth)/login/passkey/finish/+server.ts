import { json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { finishPasskeySignIn } from '$lib/server/account';
import { setSession } from '$lib/server/session';
import { safeNext } from '$lib/workspaces';

import type { RequestHandler } from './$types';

/**
 * The second half: the API checks the signed challenge, and the session it
 * opens goes into the cookies here, as a password sign-in's does (D5).
 * Answers where to go next rather than redirecting, because the browser
 * asked with `fetch`.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body.ceremony_id !== 'string' || typeof body.credential !== 'object') {
		return json({ code: 'MALFORMED_REQUEST' }, { status: 400 });
	}

	try {
		const session = await finishPasskeySignIn({
			ceremony_id: body.ceremony_id,
			credential: body.credential
		});
		if (session.data) setSession(cookies, session.data);
	} catch (error) {
		if (error instanceof ApiError) return json({ code: error.code }, { status: error.status });
		throw error;
	}

	const next = safeNext(typeof body.next === 'string' ? body.next : '', '');
	return json({ location: next ? `/sync?next=${encodeURIComponent(next)}` : '/sync' });
};
