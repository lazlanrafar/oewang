/**
 * Route parameter matchers (SvelteKit 3: one file, one `defineParams`).
 */
import { defineParams } from '@sveltejs/kit/params';

export const params = defineParams({
	/**
	 * The two category types, as a route segment (`/settings/income-category`).
	 * Anything else is a 404 rather than a page that lists nothing.
	 */
	category_type: (param) => (param === 'income' || param === 'expense' ? param : undefined)
});
