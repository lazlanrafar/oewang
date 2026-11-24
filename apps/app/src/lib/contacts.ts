/**
 * The contact page's four counts (CON-2): every contact, those added this
 * calendar month, those with an email, those with a phone. Counts of people,
 * not money, so the page works them out from the list rather than asking
 * the API for a summary route it does not have.
 */

type Countable = { email: string | null; phone: string | null; created_at: string };

export type ContactCounts = {
	total: number;
	addedThisMonth: number;
	withEmail: number;
	withPhone: number;
};

const filled = (value: string | null) => !!value && value.trim() !== '';

/** `now` is the reader's clock; "this month" is their calendar month. */
export function contactCounts(contacts: Countable[], now = new Date()): ContactCounts {
	const thisMonth = (at: string) => {
		const created = new Date(at);
		return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
	};
	return {
		total: contacts.length,
		addedThisMonth: contacts.filter((contact) => thisMonth(contact.created_at)).length,
		withEmail: contacts.filter((contact) => filled(contact.email)).length,
		withPhone: contacts.filter((contact) => filled(contact.phone)).length
	};
}
