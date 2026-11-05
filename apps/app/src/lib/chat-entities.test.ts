import { describe, expect, it } from 'vitest';

import { entityTarget, entityTargetFromDataset } from './chat-entities';
import { renderAssistantMarkdown } from './markdown';

describe('entityTarget', () => {
	it('opens a transaction in its detail sheet', () => {
		expect(entityTarget('#txn:clx7f2')).toEqual({
			kind: 'transaction',
			id: 'clx7f2',
			href: '/transactions?detail=clx7f2'
		});
	});

	it('filters the ledger to a wallet or a category', () => {
		expect(entityTarget('#wallet:clx9k1')).toMatchObject({
			kind: 'wallet',
			href: '/transactions?wallet_id=clx9k1'
		});
		expect(entityTarget('#cat:clxa3b')).toMatchObject({
			kind: 'category',
			href: '/transactions?category_id=clxa3b'
		});
	});

	it('hands a file to the page, which has no URL for it', () => {
		expect(entityTarget('#file:clxb8c')).toEqual({ kind: 'file', id: 'clxb8c' });
	});

	it('follows a route inside this app', () => {
		expect(entityTarget('#navigate:/settings?tab=assistant')).toEqual({
			kind: 'route',
			href: '/settings?tab=assistant'
		});
	});

	it('refuses a route that would leave the app', () => {
		// SEC-11. `//evil.test` is protocol-relative: a browser reads it as
		// another origin, and the model writes this string.
		expect(entityTarget('#navigate://evil.test')).toBeNull();
		expect(entityTarget('#navigate:/\\evil.test')).toBeNull();
		expect(entityTarget('#navigate:https://evil.test')).toBeNull();
		expect(entityTarget('#navigate:settings')).toBeNull();
		expect(entityTarget('#navigate:/\u0000/evil')).toBeNull();
	});

	it('judges a path after decoding it, not before', () => {
		// markdown-it percent-encodes the href, so the escaped form is what
		// arrives. `%2F%2Fevil.test` is `//evil.test`.
		expect(entityTarget('#navigate:%2F%2Fevil.test')).toBeNull();
		expect(entityTarget('#navigate:%2Fsettings')).toEqual({
			kind: 'route',
			href: '/settings'
		});
	});

	it('keeps a half-encoded value as the text it is', () => {
		expect(entityTarget('#txn:50%')).toMatchObject({ kind: 'transaction', id: '50%' });
	});

	it('escapes an id on its way into a URL', () => {
		expect(entityTarget('#cat:a&b=c')?.kind).toBe('category');
		expect(entityTarget('#cat:a&b=c')).toMatchObject({
			href: '/transactions?category_id=a%26b%3Dc'
		});
	});

	it('refuses anything that is not one of our schemes', () => {
		expect(entityTarget('https://example.com')).toBeNull();
		expect(entityTarget('#inv:clx1')).toBeNull();
		expect(entityTarget('#txn:')).toBeNull();
	});
});

describe('entityTargetFromDataset', () => {
	it('reads back exactly what the renderer wrote', () => {
		// The two halves of the feature meet here: the renderer emits these
		// attributes, and nothing else in the message is clickable.
		const html = renderAssistantMarkdown('[Warung Tekko](#txn:clx7f2)', { entityLinks: true });
		const scheme = /data-entity-scheme="([^"]+)"/.exec(html)?.[1];
		const value = /data-entity-value="([^"]+)"/.exec(html)?.[1];

		expect(entityTargetFromDataset(scheme, value)).toEqual({
			kind: 'transaction',
			id: 'clx7f2',
			href: '/transactions?detail=clx7f2'
		});
	});

	it('refuses a missing attribute rather than guessing', () => {
		expect(entityTargetFromDataset(undefined, 'clx1')).toBeNull();
		expect(entityTargetFromDataset('#txn:', null)).toBeNull();
	});
});
