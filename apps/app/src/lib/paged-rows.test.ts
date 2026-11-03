import { describe, expect, it } from 'vitest';

import { pagedRows } from './paged-rows.svelte.js';

type Row = { id: string; name: string };

const row = (id: string): Row => ({ id, name: `Row ${id}` });

const ids = (rows: Row[]): string[] => rows.map((candidate) => candidate.id);

describe('pagedRows', () => {
	it('starts with nothing', () => {
		const held = pagedRows<Row>();

		expect(held.rows).toEqual([]);
		expect(held.lastPage).toBe(0);
	});

	it('appends the next page onto the rows it holds', () => {
		const held = pagedRows<Row>();

		held.update({ rows: [row('a'), row('b')], page: 1, key: 'q=' });
		held.update({ rows: [row('c')], page: 2, key: 'q=' });

		expect(ids(held.rows)).toEqual(['a', 'b', 'c']);
		expect(held.lastPage).toBe(2);
	});

	it('drops a row the next page repeats', () => {
		const held = pagedRows<Row>();

		held.update({ rows: [row('a'), row('b')], page: 1, key: 'q=' });
		// A row written between the two fetches shifted the window, so the
		// last row of page 1 arrives again at the top of page 2.
		held.update({ rows: [row('b'), row('c')], page: 2, key: 'q=' });

		expect(ids(held.rows)).toEqual(['a', 'b', 'c']);
	});

	it('replaces everything when the key changes', () => {
		const held = pagedRows<Row>();

		held.update({ rows: [row('a'), row('b')], page: 1, key: 'q=' });
		held.update({ rows: [row('c')], page: 2, key: 'q=' });
		held.update({ rows: [row('d')], page: 1, key: 'q=lunch' });

		expect(ids(held.rows)).toEqual(['d']);
		expect(held.lastPage).toBe(1);
	});

	it('keeps the page a key change landed on', () => {
		const held = pagedRows<Row>();

		// A pasted link can open straight on page 3 of a filtered list.
		held.update({ rows: [row('a')], page: 3, key: 'q=lunch' });

		expect(held.lastPage).toBe(3);
	});

	it('replaces rather than doubling when the same page reruns', () => {
		const held = pagedRows<Row>();

		held.update({ rows: [row('a'), row('b')], page: 1, key: 'q=' });
		held.update({ rows: [row('a'), row('b')], page: 1, key: 'q=' });

		expect(ids(held.rows)).toEqual(['a', 'b']);
		expect(held.lastPage).toBe(1);
	});

	it('rewinds to an earlier page rather than appending it', () => {
		const held = pagedRows<Row>();

		held.update({ rows: [row('a')], page: 1, key: 'q=' });
		held.update({ rows: [row('b')], page: 2, key: 'q=' });
		held.update({ rows: [row('a')], page: 1, key: 'q=' });

		expect(ids(held.rows)).toEqual(['a']);
		expect(held.lastPage).toBe(1);
	});

	it('takes a deletion on a rerun of the page it holds', () => {
		const held = pagedRows<Row>();

		held.update({ rows: [row('a'), row('b')], page: 1, key: 'q=' });
		held.update({ rows: [row('a')], page: 1, key: 'q=' });

		expect(ids(held.rows)).toEqual(['a']);
	});
});
