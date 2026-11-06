import { fail, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { run, text } from '$lib/server/form-action';
import * as workspaces from '$lib/server/workspaces';
import { readText } from '$lib/url-state';

import type { PageServerLoad } from './$types';

/**
 * The workspace currency (WAL-5, WAL-6, WAL-7, D104, D105).
 *
 * Before the first transaction it is a plain setting. After that it is
 * locked, and an owner may convert instead: the target currency is in the
 * URL (`?to=`), and the load asks the API what converting to it would
 * touch and which rate to start from.
 */
export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const [{ me }, workspace] = await Promise.all([
		parent(),
		workspaces.readWorkspace(locals.accessToken)
	]);
	const current = workspace.data!;

	const to = readText(url, 'to').toUpperCase();
	const wantsPreview =
		current.currency_locked && me.role === 'owner' && /^[A-Z]{3}$/.test(to) && to !== current.currency_code;

	return {
		workspace: current,
		to: wantsPreview ? to : '',
		preview: wantsPreview ? await readPreview(to, locals.accessToken) : null
	};
};

/** Null when the API cannot answer; the page then asks for a rate by hand. */
async function readPreview(to: string, token?: string) {
	try {
		return (await workspaces.previewConversion(to, token)).data ?? null;
	} catch {
		return null;
	}
}

export const actions: Actions = {
	/**
	 * The layout's `me` carries the currency every figure is formatted in,
	 * and a form action reruns every load, so the shell follows the change
	 * without anything invalidated by hand.
	 */
	update: async ({ request, locals }) =>
		run(request, (form) =>
			workspaces.updateCurrency(text(form, 'currency_code'), locals.accessToken)
		),

	/**
	 * The typed confirmation is checked here as well as in the dialog: a
	 * conversion rewrites the whole ledger, and a form posted by hand
	 * should not skip the one step that asks whether that is meant.
	 */
	convert: async ({ request, locals }) => {
		const form = await request.formData();
		const currency = text(form, 'currency_code').toUpperCase();
		if (text(form, 'confirm').toUpperCase() !== currency) {
			const fields: Record<string, string> = { confirm: currency };
			return fail(422, { code: 'VALIDATION_FAILED', fields });
		}

		try {
			const result = await workspaces.convertCurrency(
				// A comma is how the app writes a decimal; the API reads a point.
				{ currency_code: currency, rate: text(form, 'rate').replace(',', '.') },
				locals.accessToken
			);
			return { ok: true, converted: result.data! };
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, { code: error.code, fields: error.fields });
			}
			throw error;
		}
	}
};
