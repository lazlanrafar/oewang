import { goto } from '$app/navigation';
import { page } from '$app/state';

/**
 * View state lives in the URL (UI-8).
 *
 * Anything that changes what is on screen without changing what the page is
 * about, a filter, a search, a sort, a page number, an open tab, belongs in
 * the query string. A refresh then restores it, the back button undoes it,
 * and a pasted link reproduces the view. State kept only in a component is
 * lost on both.
 *
 * Two helpers, deliberately small: `readParam` for the way in and
 * `writeParams` for the way out.
 */

/**
 * Read one parameter, constrained to the values the page accepts.
 *
 * A URL is user input: `?tab=nonsense` comes back as the fallback rather than
 * as a tab that does not exist.
 */
export function readParam<T extends string>(
	url: { searchParams: { get(name: string): string | null } },
	key: string,
	allowed: readonly T[],
	fallback: T
): T {
	const value = url.searchParams.get(key);
	return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Read every value of a parameter that may repeat.
 *
 * A multi-select filter is `?category_id=a&category_id=b`, which is the
 * shape both `URLSearchParams` and the API already understand, rather than
 * a comma-joined string nobody can hold an id containing a comma in.
 */
export function readValues(
	url: { searchParams: { getAll(name: string): string[] } },
	key: string
): string[] {
	return url.searchParams.getAll(key).filter((value) => value !== '');
}

/** Read a free-text parameter, such as a search box. */
export function readText(
	url: { searchParams: { get(name: string): string | null } },
	key: string,
	fallback = ''
): string {
	return url.searchParams.get(key) ?? fallback;
}

/**
 * Write parameters onto the current URL.
 *
 * `null` removes a parameter, so a filter cleared by the user leaves no empty
 * `?q=` behind. The history entry is replaced rather than added: typing in a
 * search box should not leave one back-button step per keystroke. Pass
 * `push: true` where a step is wanted, such as moving to the next page.
 *
 * Scroll position and focus are kept, because this navigation is a filter
 * being applied, not a new page being opened.
 */
export async function writeParams(
	values: Record<string, string | number | boolean | string[] | null | undefined>,
	options: { push?: boolean } = {}
): Promise<void> {
	// `page.url` is readonly, so the change is made on a copy.
	const url = new URL(page.url.href);

	for (const [key, value] of Object.entries(values)) {
		// An array is a parameter that may repeat, so the key is cleared and
		// then appended to. An empty array clears it, which is the same thing
		// an empty string means for a single value.
		if (Array.isArray(value)) {
			url.searchParams.delete(key);
			for (const entry of value) {
				if (entry !== '') url.searchParams.append(key, entry);
			}
			continue;
		}

		if (value === null || value === undefined || value === '') {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, String(value));
		}
	}

	if (url.href === page.url.href) return;

	await goto(url, {
		replace: options.push !== true,
		// Leave scroll position and focus alone: this is a filter being
		// applied, not a new page being opened.
		reset: false
	});
}
