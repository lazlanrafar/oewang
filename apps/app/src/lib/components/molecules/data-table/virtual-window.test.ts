import { describe, expect, it } from 'vitest';

import { GROUP_ROW_HEIGHT, ROW_HEIGHT } from './columns.js';
import { blockHeights, windowOf } from './virtual-window.js';

/** Five uneven day blocks, 800px in all, tops at 0, 100, 300, 350 and 650. */
const BLOCKS = [100, 200, 50, 300, 150];

/** Twenty even blocks, taller than any viewport the tests assume. */
const TALL = Array.from({ length: 20 }, () => 100);

/** The identity the whole module exists to keep. */
function assertHeightsAddUp(heights: number[], scrollTop: number, viewport: number): void {
	const window = windowOf(heights, scrollTop, viewport);
	const rendered = heights.slice(window.start, window.end).reduce((sum, h) => sum + h, 0);

	expect(window.padTop + rendered + window.padBottom).toBe(window.total);
}

describe('windowOf', () => {
	it('keeps padTop plus the rendered blocks plus padBottom equal to the total', () => {
		// A scrollbar that changes length as the window moves is the bug this
		// catches, so it is checked the length of the list rather than once.
		for (const scrollTop of [0, 1, 99, 100, 349, 350, 500, 650, 799, 800]) {
			assertHeightsAddUp(BLOCKS, scrollTop, 200);
		}
	});

	it('renders the blocks the viewport covers', () => {
		expect(windowOf(BLOCKS, 0, 100, 0)).toEqual({
			start: 0,
			end: 1,
			padTop: 0,
			padBottom: 700,
			total: 800
		});

		expect(windowOf(BLOCKS, 350, 50, 0)).toEqual({
			start: 3,
			end: 4,
			padTop: 350,
			padBottom: 150,
			total: 800
		});
	});

	it('does not pull in the block a viewport ends exactly on', () => {
		// 0 to 100 covers the first block and touches the second's first
		// pixel without showing it.
		expect(windowOf(BLOCKS, 0, 100, 0).end).toBe(1);
	});

	it('clamps a scrollTop before the start', () => {
		// Elastic scrolling on macOS reports a negative offset for as long as
		// the reader holds the list there.
		expect(windowOf(BLOCKS, -500, 100, 0)).toEqual(windowOf(BLOCKS, 0, 100, 0));
	});

	it('clamps a scrollTop past the end to the last blocks', () => {
		// A filter that shortens the list leaves the container scrolled past
		// the new end for a frame.
		expect(windowOf(BLOCKS, 10_000, 100, 0)).toEqual({
			start: 4,
			end: 5,
			padTop: 650,
			padBottom: 0,
			total: 800
		});
		assertHeightsAddUp(BLOCKS, 10_000, 100);
	});

	it('answers with a zero window for no blocks', () => {
		expect(windowOf([], 0, 500)).toEqual({
			start: 0,
			end: 0,
			padTop: 0,
			padBottom: 0,
			total: 0
		});
	});

	it('fills roughly a screen when there is no viewport to measure', () => {
		// Server rendering has no viewport, and the page must not arrive
		// blank for a reader without JavaScript.
		const window = windowOf(TALL, 0, 0, 0);
		const rendered = TALL.slice(window.start, window.end).reduce((sum, h) => sum + h, 0);

		expect(window.start).toBe(0);
		expect(rendered).toBeGreaterThanOrEqual(900);
		expect(rendered).toBeLessThan(1200);
	});

	it('renders two blocks either side by default', () => {
		const tight = windowOf(BLOCKS, 350, 50, 0);
		const padded = windowOf(BLOCKS, 350, 50);

		expect(tight).toMatchObject({ start: 3, end: 4 });
		expect(padded).toMatchObject({ start: 1, end: 5 });
	});

	it('takes an overscan of its own and clamps it to the list', () => {
		expect(windowOf(BLOCKS, 350, 50, 1)).toMatchObject({ start: 2, end: 5 });
		// An overscan wider than the list cannot run off either end.
		expect(windowOf(BLOCKS, 350, 50, 99)).toMatchObject({
			start: 0,
			end: 5,
			padTop: 0,
			padBottom: 0
		});
	});
});

describe('blockHeights', () => {
	const groups = [
		{ day: '2026-11-03', rows: [1, 2, 3] },
		{ day: '2026-11-02', rows: [1] }
	];

	it('measures an expanded day as its header plus its rows', () => {
		expect(blockHeights(groups, {})).toEqual([
			GROUP_ROW_HEIGHT + 3 * ROW_HEIGHT,
			GROUP_ROW_HEIGHT + ROW_HEIGHT
		]);
	});

	it('measures a collapsed day as its header alone', () => {
		expect(blockHeights(groups, { '2026-11-03': true })).toEqual([
			GROUP_ROW_HEIGHT,
			GROUP_ROW_HEIGHT + ROW_HEIGHT
		]);
	});

	it('windows collapsed days without losing the identity', () => {
		const collapsed = blockHeights(groups, { '2026-11-03': true, '2026-11-02': true });

		expect(collapsed).toEqual([GROUP_ROW_HEIGHT, GROUP_ROW_HEIGHT]);
		assertHeightsAddUp(collapsed, 0, 60);
	});
});
