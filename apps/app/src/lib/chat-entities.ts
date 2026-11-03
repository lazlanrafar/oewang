/**
 * Entity links, from the model's text to something that opens (D33, CHAT-11).
 *
 * `$lib/markdown` does the first half: a link in one of our schemes becomes
 * a button carrying the scheme and the value, and every other link loses
 * its anchor (SEC-11). This is the second half, the part that decides what
 * a click does.
 *
 * It is pure, and it returns a target rather than navigating, for two
 * reasons: the rule that a model-chosen destination stays inside this app
 * is then testable without a browser, and the page keeps the decision about
 * what "open" means for it.
 */

import { parseEntityLink } from '$lib/markdown';

export type EntityTarget =
	/** The transaction's detail sheet, on the transactions page. */
	| { kind: 'transaction'; id: string; href: string }
	/** That wallet's money: the transaction list, filtered to it. */
	| { kind: 'wallet'; id: string; href: string }
	/** That category's money: the same list, filtered to it. */
	| { kind: 'category'; id: string; href: string }
	/** An attached file. The page shows it; there is no URL to go to. */
	| { kind: 'file'; id: string }
	/** A route inside this app, and only inside it. */
	| { kind: 'route'; href: string };

/**
 * What a rendered entity link opens, or null when nothing should.
 *
 * Null is a rendered button that does nothing, which is why the renderer
 * only emits a button for a scheme this function knows: the two lists are
 * the same list, checked by the tests on both sides.
 */
export function entityTarget(href: string): EntityTarget | null {
	const link = parseEntityLink(href);
	if (!link) return null;

	// markdown-it percent-encodes an href before this module sees it, so a
	// path arrives escaped and has to be read back before it is judged.
	// Decoding first is deliberate: `#navigate:%2F%2Fevil.test` must be
	// tested as `//evil.test`, which is the form that would leave the app.
	const value = decode(link.value);

	switch (link.scheme) {
		case '#txn:':
			return { kind: 'transaction', id: value, href: query('detail', value) };
		case '#wallet:':
			return { kind: 'wallet', id: value, href: query('wallet_id', value) };
		case '#cat:':
			return { kind: 'category', id: value, href: query('category_id', value) };
		case '#file:':
			return { kind: 'file', id: value };
		case '#navigate:': {
			const path = internalPath(value);
			return path === null ? null : { kind: 'route', href: path };
		}
		default:
			return null;
	}
}

/** The same decision, from the attributes the renderer wrote. */
export function entityTargetFromDataset(
	scheme: string | null | undefined,
	value: string | null | undefined
): EntityTarget | null {
	if (!scheme || !value) return null;
	return entityTarget(`${scheme}${value}`);
}

function query(key: string, id: string): string {
	return `/transactions?${key}=${encodeURIComponent(id)}`;
}

/**
 * A route the model named, if it is one of ours.
 *
 * The model writes this string, so it is attacker-reachable through a
 * receipt or a pasted message ([AI safety](../../../docs/security/ai-safety.md)).
 * A path that is not rooted, or that a browser would read as
 * protocol-relative, is refused rather than repaired: `//evil.test` and
 * `/\evil.test` both leave the app, and neither is a mistake worth guessing
 * the intent behind.
 */
function internalPath(value: string): string | null {
	if (!value.startsWith('/')) return null;
	if (value.startsWith('//') || value.startsWith('/\\')) return null;
	// A control character in a URL is nothing a route of ours contains, and
	// browsers strip some of them before resolving, so `/\n/evil` is not
	// the path it looks like.
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f]/.test(value)) return null;

	return value;
}

function decode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		// A lone percent is not an encoding. The raw text is then what the
		// model wrote, and the checks above still apply to it.
		return value;
	}
}
