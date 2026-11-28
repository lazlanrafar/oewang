import { fail } from '@sveltejs/kit';

import { MB, parseLimit } from '$lib/console';
import { t } from '$lib/i18n';
import * as consoleApi from '$lib/server/console';
import { run, text } from '$lib/server/form-action';
import { readText } from '$lib/url-state';

import type { Actions, PageServerLoad } from './$types';

/**
 * The console's plans (PLN-1, OEW-131). A short list, so it does not page;
 * the search lives in the URL (UI-8, D55) and narrows the list here.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const search = readText(url, 'search').trim().toLowerCase();
	const plans = await consoleApi.listConsolePlans(locals.accessToken);
	return {
		plans: search ? plans.filter((plan) => plan.name.toLowerCase().includes(search)) : plans,
		filtered: search !== ''
	};
};

/**
 * The name, both limits and the whole feature set, as the form posts them,
 * or the field a limit failed on. A limit that does not parse is refused
 * here rather than sent, because a dropped value would read as unlimited.
 */
function body(form: FormData): { fields: Record<string, string> } | { body: consoleApi.ConsolePlanBody } {
	const max_tokens_month = parseLimit(text(form, 'max_tokens_month'));
	const max_storage_bytes = parseLimit(text(form, 'max_storage_mb'), MB);
	const invalid = t('console.plans.form.limit_invalid');
	if (max_tokens_month === undefined) return { fields: { max_tokens_month: invalid } };
	if (max_storage_bytes === undefined) return { fields: { max_storage_bytes: invalid } };
	return {
		body: {
			name: text(form, 'name'),
			max_tokens_month,
			max_storage_bytes,
			features: form.getAll('features').map(String)
		}
	};
}

async function save(request: Request, call: (body: consoleApi.ConsolePlanBody, form: FormData) => Promise<unknown>) {
	const form = await request.clone().formData();
	const parsed = body(form);
	if ('fields' in parsed) return fail(400, { code: 'VALIDATION_FAILED', fields: parsed.fields });
	return run(request, (sent) => call(parsed.body, sent));
}

/** Create, edit and delete. The API refuses the system plan and a plan still held. */
export const actions: Actions = {
	create: async ({ request, locals }) =>
		save(request, (plan) => consoleApi.createConsolePlan(plan, locals.accessToken)),

	update: async ({ request, locals }) =>
		save(request, (plan, form) => consoleApi.updateConsolePlan(text(form, 'id'), plan, locals.accessToken)),

	delete: async ({ request, locals }) =>
		run(request, (form) => consoleApi.deleteConsolePlan(text(form, 'id'), locals.accessToken))
};
