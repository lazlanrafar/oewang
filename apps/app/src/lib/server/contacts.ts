/**
 * The contact endpoints (CON-1 to CON-4, D120).
 *
 * A contact is the person on the other side of a debt. The old app's
 * invoice fields (address, VAT, website, billing emails) are not carried.
 */

import { api, type Envelope } from './api';

export type Contact = {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
	note: string | null;
	created_at: string;
	updated_at: string;
	/** On the single read only (CON-3): live debts that name this contact. */
	debt_count?: number;
	open_debt_count?: number;
};

export type ContactBody = { name: string; email?: string | null; phone?: string | null; note?: string | null };

/** The API caps a page at 100 (docs/api/conventions.md#pagination). */
const PAGE_LIMIT = 100;

/** `search`, `sort`, `order`, `page` and `limit`, passed straight through. */
export function listContacts(query: URLSearchParams, token?: string): Promise<Envelope<Contact[]>> {
	return api<Contact[]>({ path: '/v1/contacts', query, token });
}

/**
 * Every contact, page by page, for the page's cards and for the picker.
 *
 * shortcut: walks every page; a workspace with thousands of contacts wants a
 * summary route and a search-as-you-type picker instead.
 */
export async function allContacts(token?: string): Promise<Contact[]> {
	const rows: Contact[] = [];
	for (let page = 1; ; page++) {
		const query = new URLSearchParams({ sort: 'name', page: String(page), limit: String(PAGE_LIMIT) });
		const result = await listContacts(query, token);
		rows.push(...(result.data ?? []));
		if (page >= (result.meta.total_pages ?? 1)) return rows;
	}
}

/** The picker's list: id and name, every contact (D80). */
export async function pickerContacts(token?: string): Promise<Array<{ id: string; name: string }>> {
	return (await allContacts(token)).map((contact) => ({ id: contact.id, name: contact.name }));
}

export function readContact(id: string, token?: string): Promise<Envelope<Contact>> {
	return api<Contact>({ path: `/v1/contacts/${encodeURIComponent(id)}`, token });
}

export function createContact(body: ContactBody, token?: string) {
	return api<Contact>({ method: 'POST', path: '/v1/contacts', body, token });
}

export function updateContact(id: string, body: ContactBody, token?: string) {
	return api<Contact>({ method: 'PATCH', path: `/v1/contacts/${encodeURIComponent(id)}`, body, token });
}

export function deleteContact(id: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/contacts/${encodeURIComponent(id)}`, token });
}

/** Move `id`'s debts to `intoId` and remove `id` (CON-4). */
export function mergeContact(id: string, intoId: string, token?: string) {
	return api<Contact>({
		method: 'POST',
		path: `/v1/contacts/${encodeURIComponent(id)}/merge`,
		body: { into_id: intoId },
		token
	});
}
