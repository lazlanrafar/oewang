import { error } from '@sveltejs/kit';
import { dev } from '$app/env';

import type { LayoutServerLoad } from './$types';

/**
 * Development only.
 *
 * The page reads nothing and writes nothing, but it is scaffolding, and
 * scaffolding that ships is scaffolding someone finds. A 404 rather than a
 * 403, so a production deployment does not even admit the route exists.
 */
export const load: LayoutServerLoad = () => {
	if (!dev) {
		error(404, 'Not found');
	}
	return {};
};
