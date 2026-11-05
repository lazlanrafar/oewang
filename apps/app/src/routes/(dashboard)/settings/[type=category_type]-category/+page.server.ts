import type { Actions } from '@sveltejs/kit';

import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { run, text } from '$lib/server/form-action';
import * as ledger from '$lib/server/ledger';
import type { Category } from '$lib/server/ledger';
import type { PageServerLoad } from './$types';

type CategoryType = 'income' | 'expense';

/**
 * One category type's rows (`/settings/income-category`,
 * `/settings/expense-category`).
 *
 * The page reads its own rows rather than the layout's picker list,
 * because it needs `sort_order` and the chat's `create_category` has to be
 * able to make this view stale (D32, CHAT-12).
 */
export const load: PageServerLoad = async ({ depends, locals, params }) => {
	depends(INVALIDATION_KEYS.categories);

	const type = params.type as CategoryType;
	const categories = (await ledger.listCategories(locals.accessToken)).data ?? [];

	return {
		type,
		categories: categories.filter((category) => category.type === type)
	};
};

/**
 * Every action takes its type from the path, never from the form: a page
 * for income categories only ever makes income categories.
 */
export const actions: Actions = {
	createCategory: async ({ request, locals, params }) =>
		run(request, (form) =>
			ledger.createCategory(
				{ name: text(form, 'name'), type: params.type as CategoryType },
				locals.accessToken
			)
		),

	updateCategory: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.updateCategory(text(form, 'id'), { name: text(form, 'name') }, locals.accessToken)
		),

	reorderCategories: async ({ request, locals, params }) =>
		run(request, async (form) => {
			const categories = (await ledger.listCategories(locals.accessToken)).data ?? [];
			const siblings = categories.filter((category) => category.type === params.type);
			const order = reorder(siblings, form.getAll('ids').map(String));

			await Promise.all(
				order
					.map((row, index) => ({ row, index }))
					.filter(({ row, index }) => row.sort_order !== index)
					.map(({ row, index }) =>
						ledger.updateCategory(row.id, { sort_order: index }, locals.accessToken)
					)
			);
		}),

	deleteCategory: async ({ request, locals }) =>
		run(request, (form) => ledger.deleteCategory(text(form, 'id'), locals.accessToken))
};

/**
 * The rows of this type in the order the browser sent.
 *
 * The browser's list is a request, not the truth: an id that is not one of
 * this type's rows is dropped, and a row it left out (one created in
 * another tab since the page loaded) keeps its place after the rest.
 * Positions are rewritten from the result rather than nudged, because
 * seeded rows all carry `sort_order` 0 and nudging one would move nothing.
 */
function reorder(siblings: Category[], ids: string[]): Category[] {
	const byId = new Map(siblings.map((row) => [row.id, row]));
	const listed = [...new Set(ids)].flatMap((id) => byId.get(id) ?? []);
	const rest = siblings.filter((row) => !listed.includes(row));
	return [...listed, ...rest];
}
