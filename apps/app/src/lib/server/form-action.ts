/**
 * The shape every settings form action shares.
 *
 * Accounts, transactions and chat still carry their own copies of these two;
 * folding them in is a separate change.
 */
import { fail } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';

/**
 * Run one action, turning an API error into a field-aware failure.
 *
 * The code comes back rather than a message: the page maps it through the
 * dictionary, because the API's own message is for developers (UI-1).
 */
export async function run(request: Request, call: (form: FormData) => Promise<unknown>) {
	const form = await request.formData();

	try {
		await call(form);
		return { ok: true };
	} catch (error) {
		if (error instanceof ApiError) {
			return fail(error.status, { code: error.code, fields: error.fields });
		}
		throw error;
	}
}

/** A form field as trimmed text, empty when absent. */
export function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}
