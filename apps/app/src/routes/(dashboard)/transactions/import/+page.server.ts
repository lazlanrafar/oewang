import { fail, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import * as ledger from '$lib/server/ledger';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const token = locals.accessToken;

	const [wallets, categories] = await Promise.all([
		ledger.listWallets(token),
		ledger.listCategories(token)
	]);

	return { wallets: wallets.data ?? [], categories: categories.data ?? [] };
};

export const actions: Actions = {
	/**
	 * Commit the mapped rows (TXN-11).
	 *
	 * The payload is the file's own strings plus the mapping. Nothing here
	 * reads an amount: the API parses every figure, which is the whole
	 * point of mapping columns rather than extracting rows (D28).
	 */
	commit: async ({ request, locals }) => {
		const form = await request.formData();

		try {
			const result = await ledger.importRows(
				{
					wallet_id: String(form.get('wallet_id') ?? ''),
					mapping: JSON.parse(String(form.get('mapping') ?? '{}')),
					rows: JSON.parse(String(form.get('rows') ?? '[]')),
					categories: JSON.parse(String(form.get('categories') ?? '{}'))
				},
				locals.accessToken
			);

			return { result: result.data };
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, { code: error.code });
			}
			throw error;
		}
	},

	/** Create a category the file named but the workspace does not have. */
	createCategory: async ({ request, locals }) => {
		const form = await request.formData();

		try {
			const created = await ledger.createCategory(
				{
					name: String(form.get('name') ?? '').trim(),
					type: String(form.get('type') ?? 'expense')
				},
				locals.accessToken
			);
			return { created: created.data };
		} catch (error) {
			if (error instanceof ApiError) return fail(error.status, { code: error.code });
			throw error;
		}
	}
};
