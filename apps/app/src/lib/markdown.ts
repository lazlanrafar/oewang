/**
 * The assistant's Markdown, rendered safely (SEC-11, CHAT-11).
 *
 * Model output is the one string in this app that an attacker can shape
 * through a receipt, a statement or a pasted message, so it is also the one
 * place where turning text into HTML has to be argued for rather than
 * assumed.
 *
 * The argument: markdown-it runs with `html: false`, so raw HTML in the
 * model's text is escaped rather than parsed, and the whole class of HTML
 * injection never arises. There is no second sanitizer because there is no
 * raw HTML to sanitize. What is left is links and images, and both are
 * handled here rather than trusted:
 *
 * - Images are disabled. `![](https://attacker/pixel)` renders as its own
 *   text. An image the model chooses is a request the browser makes to a
 *   host the model chose, which is an exfiltration channel whatever the
 *   bytes turn out to be.
 * - A link is rendered only when it is one of ours (D33). Anything else,
 *   including `javascript:` and every external host, loses its anchor and
 *   leaves the text behind (CHAT-11).
 */

// markdown-it ships its own types from v15, so there is no @types package
// here and no second copy of Token to disagree with this one.
import MarkdownIt, { type Token } from 'markdown-it';

/** The entity schemes the chat UI knows how to open (D33). */
export const ENTITY_SCHEMES = ['#txn:', '#wallet:', '#cat:', '#file:', '#navigate:'] as const;

export type EntityLink = { scheme: string; value: string };

export function parseEntityLink(href: string): EntityLink | null {
	const scheme = ENTITY_SCHEMES.find((candidate) => href.startsWith(candidate));
	if (!scheme) return null;

	const value = href.slice(scheme.length);
	return value === '' ? null : { scheme, value };
}

export type RenderOptions = {
	/**
	 * Render our own links as buttons. False renders them as plain text,
	 * which is what a page with nothing to open them does: a button that
	 * does nothing is worse than a word.
	 */
	entityLinks?: boolean;
};

const renderer = new MarkdownIt({
	// The whole argument above rests on this line.
	html: false,
	// A bare URL in prose stays prose. Autolinking would hand the model a
	// link it never asked for.
	linkify: false,
	breaks: false,
	typographer: false
});

renderer.disable('image');

/** An attribute value is typed loosely by the parser; a link href is text. */
function href(token: Token): string {
	return String(token.attrGet('href') ?? '');
}

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Render one assistant message.
 *
 * The result is trusted HTML only in the sense that this function built it;
 * every piece of the model's own text has been escaped or dropped on the way
 * through.
 */
export function renderAssistantMarkdown(text: string, options: RenderOptions = {}): string {
	const entityLinks = options.entityLinks ?? false;

	// Rules are set per call rather than once, because the two modes render
	// the same link differently and a shared renderer would carry the last
	// caller's choice.
	renderer.renderer.rules.link_open = (tokens: Token[], index: number) => {
		const entity = parseEntityLink(href(tokens[index]));
		if (!entityLinks || !entity) return '';

		return (
			`<button type="button" data-entity-scheme="${escapeAttribute(entity.scheme)}"` +
			` data-entity-value="${escapeAttribute(entity.value)}">`
		);
	};

	renderer.renderer.rules.link_close = (tokens: Token[], index: number) => {
		// `link_close` carries no href, so the matching open token decides.
		const open = findOpen(tokens, index);
		const entity = open ? parseEntityLink(href(open)) : null;
		return !entityLinks || !entity ? '' : '</button>';
	};

	return renderer.render(text);
}

function findOpen(tokens: Token[], index: number): Token | null {

	let depth = 0;
	for (let position = index - 1; position >= 0; position -= 1) {
		const token = tokens[position];
		if (token.type === 'link_close') depth += 1;
		if (token.type === 'link_open') {
			if (depth === 0) return token;
			depth -= 1;
		}
	}
	return null;
}
