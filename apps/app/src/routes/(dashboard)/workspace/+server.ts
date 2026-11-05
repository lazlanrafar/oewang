import { json, error } from '@sveltejs/kit';

import * as ledger from '$lib/server/ledger';
import { ApiError } from '$lib/server/api';

import type { RequestHandler } from './$types';

/**
 * Make one of the workspace's own list entries, from the picker it was
 * typed into.
 *
 * Here rather than as a form action because the caller is a component, not
 * a form: a picker's create row is a button inside a panel, and the page it
 * happens to be on should not have to carry an action for it.
 *
 * **Whose workspace.** The token is this app's, read from the session
 * cookie; the workspace is a claim inside it (AUTH-4). The body carries a
 * name and, for a category, a type. It cannot name a workspace, so a
 * request cannot reach another one. The browser never talks to the API
 * (D5): this route does, inside the OWE1 envelope.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as { kind?: string; name?: string; type?: string };
	const name = body.name?.trim();

	if (!name) error(400, 'A name is required');

	try {
		switch (body.kind) {
			case 'wallet': {
				const created = await ledger.createWallet({ name }, locals.accessToken);
				return json({ id: created.data!.id, name: created.data!.name });
			}
			case 'group': {
				const created = await ledger.createWalletGroup({ name }, locals.accessToken);
				return json({ id: created.data!.id, name: created.data!.name });
			}
			case 'category': {
				// Income or expense, and nothing about a name says which, so
				// the caller states it. Anything else is refused rather than
				// defaulted: a category filed under the wrong one is invisible
				// in the picker that needed it.
				const type = body.type === 'income' ? 'income' : body.type === 'expense' ? 'expense' : null;
				if (!type) error(400, 'A category is income or expense');

				const created = await ledger.createCategory({ name, type }, locals.accessToken);
				return json({ id: created.data!.id, name: created.data!.name });
			}
			default:
				error(400, 'Unknown kind');
		}
	} catch (cause) {
		// The API's own refusal, such as a duplicate name, reaches the picker
		// as a failure rather than as a silent nothing.
		if (cause instanceof ApiError) error(cause.status, cause.code);
		throw cause;
	}
};
