import * as contactsApi from '$lib/server/contacts';
import * as debtsApi from '$lib/server/debts';
import { run, text } from '$lib/server/form-action';
import { readParam } from '$lib/url-state';

import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 50;

/**
 * The contacts screen (CON-2, D120).
 *
 * The search, the sort, the page and the open contact (`?contact=`) live in
 * the URL (UI-8, D55); the debts page links a contact's name here. The cards
 * count every contact, whatever the search, as the old page's did.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const token = locals.accessToken;
	const search = (url.searchParams.get('search') ?? '').trim();
	const sort = readParam(url, 'sort', ['name', 'created_at'] as const, 'name');
	const order = readParam(url, 'order', ['asc', 'desc'] as const, 'asc');
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const query = new URLSearchParams({ sort, order, limit: String(PAGE_SIZE) });
	if (search) query.set('search', search);

	const openId = url.searchParams.get('contact');

	const [contacts, all, open] = await Promise.all([
		contactsApi.listContacts(new URLSearchParams([...query, ['page', String(page)]]), token),
		contactsApi.allContacts(token),
		openId ? debtsApi.contactSheet(openId, token) : null
	]);

	return {
		contacts: contacts.data ?? [],
		meta: contacts.meta,
		all,
		open,
		filterKey: query.toString(),
		filtered: search !== ''
	};
};

const optional = (form: FormData, key: string) => text(form, key) || null;

const body = (form: FormData): contactsApi.ContactBody => ({
	name: text(form, 'name'),
	email: optional(form, 'email'),
	phone: optional(form, 'phone'),
	note: optional(form, 'note')
});

/** Form actions, so every write works with JavaScript off. */
export const actions: Actions = {
	create: async ({ request, locals }) =>
		run(request, (form) => contactsApi.createContact(body(form), locals.accessToken)),

	update: async ({ request, locals }) =>
		run(request, (form) => contactsApi.updateContact(text(form, 'id'), body(form), locals.accessToken)),

	delete: async ({ request, locals }) =>
		run(request, (form) => contactsApi.deleteContact(text(form, 'id'), locals.accessToken)),

	merge: async ({ request, locals }) =>
		run(request, (form) =>
			contactsApi.mergeContact(text(form, 'id'), text(form, 'into_id'), locals.accessToken)
		)
};
