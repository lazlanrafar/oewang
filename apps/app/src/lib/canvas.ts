/**
 * The canvas, as the URL carries it (D31, CHAT-13).
 *
 * The side panel holds a real application component rather than anything
 * the model authored (docs/features/chat.md#canvas). What is open lives in
 * `?canvas=` and `?id=`, so the panel survives a reload, the back button
 * closes it, and a pasted link reopens the same thing.
 *
 * Two tiny functions, both pure: the way in and the way out. The reading
 * side is the one that matters, because a URL is user input and
 * `?canvas=nonsense` must open nothing rather than an empty panel.
 */

/**
 * What the panel can hold.
 *
 * `receipt` is the confirmation sheet over a parsed receipt, keyed by the
 * vault file the user uploaded. `transaction` is the real transaction form,
 * keyed by the same vault file, which is the manual-entry fallback an
 * unreadable image falls back to with the image already attached (AI-3).
 */
export const CANVAS_KINDS = ['receipt', 'transaction'] as const;

export type CanvasKind = (typeof CANVAS_KINDS)[number];

export type CanvasState = { kind: CanvasKind; id: string };

/** The panel's width above the medium breakpoint. Full width below it. */
export const CANVAS_WIDTH = 560;

/**
 * What the panel should show for this URL, or nothing.
 *
 * A kind this app does not know and an empty id both read as closed. The
 * alternative, an open panel with nothing in it, is a worse answer to a
 * mistyped link than no panel at all.
 */
export function readCanvas(url: {
	searchParams: { get(name: string): string | null };
}): CanvasState | null {
	const kind = url.searchParams.get('canvas');
	const id = url.searchParams.get('id') ?? '';

	if (!CANVAS_KINDS.includes(kind as CanvasKind)) return null;
	if (id === '') return null;

	return { kind: kind as CanvasKind, id };
}

/**
 * The parameters that open or close the panel, ready for `writeParams`.
 *
 * Closing sends `null` for both, which is how `writeParams` deletes a
 * parameter rather than leaving `?canvas=` behind.
 */
export function canvasParams(state: CanvasState | null): {
	canvas: string | null;
	id: string | null;
} {
	return state === null ? { canvas: null, id: null } : { canvas: state.kind, id: state.id };
}
