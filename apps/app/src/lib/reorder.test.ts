import { describe, expect, it } from 'vitest';

import { reorder, sortOrderChanges } from './reorder';

const row = (id: string, sort_order = 0) => ({ id, sort_order });

describe('reorder', () => {
	it('follows the order sent, dropping strangers and duplicates', () => {
		const order = reorder([row('a'), row('b'), row('c')], ['c', 'x', 'a', 'c', 'b']);
		expect(order.map((r) => r.id)).toEqual(['c', 'a', 'b']);
	});

	it('keeps a sibling the browser left out, after the rest', () => {
		const order = reorder([row('a'), row('b'), row('new')], ['b', 'a']);
		expect(order.map((r) => r.id)).toEqual(['b', 'a', 'new']);
	});
});

describe('sortOrderChanges', () => {
	it('rewrites positions, so seeded zeros still move', () => {
		expect(sortOrderChanges([row('b'), row('a'), row('c', 2)])).toEqual([
			{ id: 'a', sort_order: 1 }
		]);
	});
});
