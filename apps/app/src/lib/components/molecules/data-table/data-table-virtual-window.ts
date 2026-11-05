/**
 * Which day blocks the transactions table has to render, and nothing else.
 *
 * The table groups rows by day, and a day is the unit that gets windowed: a
 * block is wholly rendered or wholly absent. Windowing per row instead would
 * mean a day header without its rows, or rows under a header that is off
 * screen, and the sticky day header is the thing that makes the list
 * readable.
 *
 * Blocks are tall and uneven, so the offsets are summed once into a prefix
 * array and then binary-searched. Scrolling a long list calls this on every
 * frame, and a linear scan per call is the difference between a smooth
 * scroll and a list that stutters once a workspace has a year of history.
 *
 * Pure arithmetic: no DOM, no runes, no side effects, which is what lets the
 * tests below cover the cases a browser makes awkward to reach.
 */

import { GROUP_ROW_HEIGHT, ROW_HEIGHT } from './columns.js';

export type VirtualWindow = {
	/** Index of the first block to render. */
	start: number;
	/** One past the last block to render. */
	end: number;
	/** Pixels of spacer standing in for everything before `start`. */
	padTop: number;
	/** Pixels of spacer standing in for everything after `end`. */
	padBottom: number;
	/** The height of every block, rendered or not. */
	total: number;
};

/**
 * How much of the list to render on a viewport that has not measured itself.
 *
 * The page is server rendered and has to be readable before, and without,
 * JavaScript (D5), where there is no viewport to ask. Roughly a laptop
 * window's worth of rows: enough that the first screen is filled, little
 * enough that a year of history is not serialized into the HTML.
 */
const ASSUMED_VIEWPORT = 900;

/** Blocks either side of the viewport, rendered so a scroll does not flash. */
const DEFAULT_OVERSCAN = 2;

/**
 * The height each day block takes, collapsed or expanded.
 *
 * The arithmetic lives here rather than at the two call sites, because a
 * spacer computed from one formula and a block rendered from another is a
 * scrollbar that drifts as the reader scrolls, and nothing in the UI says
 * which of the two is wrong.
 */
export function blockHeights(
	groups: { day: string; rows: unknown[] }[],
	collapsed: Record<string, boolean>
): number[] {
	return groups.map(
		(group) =>
			GROUP_ROW_HEIGHT + (collapsed[group.day] ? 0 : group.rows.length * ROW_HEIGHT)
	);
}

/**
 * The slice of blocks that covers the viewport, plus the spacers either side.
 *
 * `padTop + the heights of blocks start..end + padBottom === total`, always.
 * That identity is the whole contract: the scroll container's height has to
 * stay the same whichever blocks are mounted, or the scrollbar jumps under
 * the reader's thumb every time the window moves.
 *
 * A `scrollTop` outside the list clamps rather than throwing. It arrives out
 * of range in ordinary use: a filter that shortens the list leaves the
 * container scrolled past the new end for one frame, and elastic scrolling on
 * macOS reports a negative offset for as long as the reader holds it there.
 */
export function windowOf(
	heights: number[],
	scrollTop: number,
	viewportHeight: number,
	overscan: number = DEFAULT_OVERSCAN
): VirtualWindow {
	// A fresh object rather than a shared constant: a caller is free to keep
	// the window it was handed, and a shared one would be the same object on
	// every empty render.
	if (heights.length === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0, total: 0 };

	// `offsets[i]` is the top of block `i`, and `offsets[length]` is the
	// total, so one array answers both questions.
	const offsets = prefixSums(heights);
	const total = offsets[heights.length];

	const viewport = viewportHeight > 0 ? viewportHeight : ASSUMED_VIEWPORT;
	const top = Math.min(Math.max(scrollTop, 0), Math.max(0, total - viewport));
	const bottom = top + viewport;

	const first = blockAt(offsets, top);
	// `blockAt` of the last visible pixel, so a viewport ending exactly on a
	// boundary does not pull in the block that starts there.
	const last = blockAt(offsets, Math.max(top, bottom - 1));

	const margin = Math.max(0, Math.trunc(overscan));
	const start = Math.max(0, first - margin);
	const end = Math.min(heights.length, last + 1 + margin);

	return { start, end, padTop: offsets[start], padBottom: total - offsets[end], total };
}

/** Tops of every block, with the total appended, so `offsets[i]` is block `i`'s top. */
function prefixSums(heights: number[]): number[] {
	const offsets = new Array<number>(heights.length + 1);
	offsets[0] = 0;

	for (let index = 0; index < heights.length; index += 1) {
		offsets[index + 1] = offsets[index] + heights[index];
	}

	return offsets;
}

/**
 * The index of the block that holds `position`.
 *
 * The last index whose top is at or below the position. A zero-height block,
 * which a collapsed day never is but an empty group would be, resolves to the
 * last of the run, which is harmless: the window only ever widens.
 */
function blockAt(offsets: number[], position: number): number {
	let low = 0;
	let high = offsets.length - 2;

	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (offsets[middle] <= position) low = middle;
		else high = middle - 1;
	}

	return low;
}
