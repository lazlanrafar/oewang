import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import * as budgets from '$lib/server/budgets';
import { run, text } from '$lib/server/form-action';
import type { BudgetState } from '$lib/reports';
import { readParam, readValues } from '$lib/url-state';

import type { Actions, PageServerLoad } from './$types';

const SORTS = ['category', 'amount', 'spent', 'remaining', 'percent'] as const;
const STATES: readonly BudgetState[] = ['safe', 'warning', 'over'];

/**
 * The budget screen (BUD-1 to BUD-3, D103).
 *
 * The month, the search and the sort live in the URL (UI-8, D55), so a
 * refresh or a shared link shows the same month. The old page lost its
 * month on every refetch; this one cannot, because the URL is the only
 * place it is kept. An absent or malformed month is the current one, and
 * the API says which month it answered for.
 */
export const load: PageServerLoad = async ({ depends, locals, url }) => {
	depends(INVALIDATION_KEYS.transactions, INVALIDATION_KEYS.categories);

	const month = url.searchParams.get('month') ?? '';
	const search = (url.searchParams.get('search') ?? '').trim();
	const sort = readParam(url, 'sort', SORTS, 'category');
	const order = readParam(url, 'order', ['asc', 'desc'] as const, 'asc');

	const query = new URLSearchParams({ sort, order });
	if (/^\d{4}-\d{2}$/.test(month)) query.set('month', month);
	if (search) query.set('search', search);

	// The status facet narrows the rows here, as the accounts screen
	// narrows by group: the totals above the table still cover every budget.
	const states = readValues(url, 'state').filter((state): state is BudgetState =>
		STATES.includes(state as BudgetState)
	);

	const status = (await budgets.budgetStatus(query, locals.accessToken)).data!;
	if (states.length > 0) {
		status.budgets = status.budgets.filter((budget) => states.includes(budget.state));
	}

	return {
		status,
		filtered: search !== '' || states.length > 0
	};
};

/** Form actions, so every write works with JavaScript off. */
export const actions: Actions = {
	create: async ({ request, locals }) =>
		run(request, (form) =>
			budgets.createBudget(
				{ category_id: text(form, 'category_id'), amount: text(form, 'amount') },
				locals.accessToken
			)
		),

	update: async ({ request, locals }) =>
		run(request, (form) =>
			budgets.updateBudget(text(form, 'id'), { amount: text(form, 'amount') }, locals.accessToken)
		),

	delete: async ({ request, locals }) =>
		run(request, (form) => budgets.deleteBudget(text(form, 'id'), locals.accessToken))
};
