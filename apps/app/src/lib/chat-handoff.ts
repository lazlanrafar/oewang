/**
 * The first message of a chat started somewhere else (D87).
 *
 * The overview's composer creates the session, then navigates to it; the
 * conversation page sends what was typed as soon as it mounts. One chat
 * screen owns sending, and the overview only hands over.
 *
 * Module state, which is safe here only because both ends run in the
 * browser: `handOff` is called from an event handler and `takeHandoff` from
 * `onMount`, neither of which runs during server rendering, where module
 * state would be shared between requests. Lost on a full reload, which is
 * the right answer: a reload should not send a message twice.
 */

import type { UploadedFile } from '$lib/components/molecules/file-dropzone';

export type Handoff = {
	message: string;
	/** Files attached on the overview, already in the vault (VLT-1). */
	files: UploadedFile[];
};

let pending: { sessionId: string; handoff: Handoff } | null = null;

/** Leave a first message for the session about to open. Replaces any older one. */
export function handOff(sessionId: string, handoff: Handoff): void {
	pending = { sessionId, handoff };
}

/**
 * Collect what was left for this session, once.
 *
 * A handoff for another session is discarded rather than kept: the user
 * went somewhere else, and sending it later into a different conversation
 * would be a message they never meant to send there.
 */
export function takeHandoff(sessionId: string): Handoff | null {
	const current = pending;
	pending = null;

	return current?.sessionId === sessionId ? current.handoff : null;
}
