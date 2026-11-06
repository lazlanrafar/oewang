import type { Actions } from '@sveltejs/kit';

import { isHexColor } from '$lib/colors';
import { updateColors } from '$lib/server/account';
import { run, text } from '$lib/server/form-action';

/** A posted colour, or null for the default. The API checks it again. */
function color(form: FormData, key: string): string | null {
	const value = text(form, key).toLowerCase();
	return isHexColor(value) ? value : null;
}

export const actions: Actions = {
	/**
	 * Both colours every time, because the form holds both (UI-12, D100).
	 * The user's own preference: any member may set theirs.
	 */
	updateColors: async ({ request, locals }) =>
		run(request, (form) =>
			updateColors(
				{
					income_color: color(form, 'income_color'),
					expense_color: color(form, 'expense_color')
				},
				locals.accessToken
			)
		)
};
