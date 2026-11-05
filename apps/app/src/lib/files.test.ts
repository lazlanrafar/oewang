import { describe, expect, it } from 'vitest';

import { formatBytes, formatOf, thumbnailSrc } from './files';

describe('thumbnailSrc', () => {
	it('asks this app for an image preview, never the API or storage', () => {
		expect(thumbnailSrc({ id: 'f1', type: 'image/png' })).toBe('/vault/files/f1/thumbnail');
	});

	it('asks for nothing when the API said there is no preview (D91)', () => {
		expect(thumbnailSrc({ id: 'f1', type: 'image/png', thumbnail: false })).toBeNull();
	});

	it('asks for nothing for a PDF, which shows its icon', () => {
		expect(thumbnailSrc({ id: 'f2', type: 'application/pdf' })).toBeNull();
	});
});

describe('formatBytes', () => {
	it('reads as the old app did', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
	});
});

describe('formatOf', () => {
	it('is the subtype', () => {
		expect(formatOf('application/pdf')).toBe('pdf');
		expect(formatOf('image/jpeg')).toBe('jpeg');
	});
});
