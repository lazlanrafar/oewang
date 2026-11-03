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
