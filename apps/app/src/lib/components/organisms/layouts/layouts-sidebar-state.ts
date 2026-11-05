/**
 * The sidebar's shared facts.
 *
 * Its open state is a cookie rather than component state, because the server
 * renders the shell: without it the first paint is always the open sidebar,
 * and a reader who collapsed it watches it collapse again on every
 * navigation. The live app keeps the same cookie under the same name.
 */
export const SIDEBAR_COOKIE = 'sidebar_state';

/** A year, as the live app sets it: a layout preference is not a session. */
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The keyboard way in, the same chord the live app uses. */
export const SIDEBAR_SHORTCUT = 'b';

export function rememberSidebar(open: boolean): void {
	document.cookie = `${SIDEBAR_COOKIE}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
}
