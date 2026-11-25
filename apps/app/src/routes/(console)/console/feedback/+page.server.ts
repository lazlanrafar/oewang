import { FEEDBACK_STATUSES, FEEDBACK_TYPES, feedbackPatch } from '$lib/console';
import * as consoleApi from '$lib/server/console';
import { run, text } from '$lib/server/form-action';
import { readValues } from '$lib/url-state';

import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 50;

/**
 * The console's feedback inbox (CSL-8, US-083).
 *
 * The search, the status, the type, the page and the open item
 * (`?feedback=`) live in the URL (UI-8, D55). Newest first, every status
 * unless the URL narrows it.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const search = (url.searchParams.get('search') ?? '').trim();
	const status = readValues(url, 'status').find((value) => (FEEDBACK_STATUSES as readonly string[]).includes(value));
	const type = readValues(url, 'type').find((value) => (FEEDBACK_TYPES as readonly string[]).includes(value));
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const query = new URLSearchParams({ per_page: String(PAGE_SIZE) });
	if (search) query.set('search', search);
	if (status) query.set('status', status);
	if (type) query.set('type', type);

	const openId = url.searchParams.get('feedback');

	const [feedback, open] = await Promise.all([
		consoleApi.listConsoleFeedback(new URLSearchParams([...query, ['page', String(page)]]), locals.accessToken),
		openId ? consoleApi.consoleFeedbackItem(openId, locals.accessToken) : null
	]);

	return {
		feedback: feedback.data ?? [],
		meta: feedback.meta,
		// Read on its own, so the sheet stays open when the filter hides its row.
		open,
		filterKey: query.toString(),
		filtered: search !== '' || status !== undefined || type !== undefined
	};
};

/** Mark done, reopen, or save the note (CSL-8). The API checks `console.feedback.write`. */
export const actions: Actions = {
	update: async ({ request, locals }) =>
		run(request, (form) =>
			consoleApi.updateConsoleFeedback(text(form, 'id'), feedbackPatch(form), locals.accessToken)
		)
};
