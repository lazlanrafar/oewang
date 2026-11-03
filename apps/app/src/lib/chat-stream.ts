/**
 * The chat stream, as both ends of the proxy handle it.
 *
 * Three pure pieces, no fetch and no DOM, so each is tested without a
 * network: the frame reader that turns bytes into events, the turn state
 * machine the page advances with them, and the composer's sizing rule.
 *
 * Both ends parse frames. The SvelteKit route reads the API's sealed events
 * to open them one by one (docs/api/encryption.md#chat-stream-events), and
 * the page reads the plaintext frames the route re-emits. One reader rather
 * than two, because an off-by-one in a frame boundary is invisible until a
 * token arrives split across two TCP chunks.
 *
 * The event protocol is specified in docs/ai/service.md#streaming-protocol.
 */

export type SseFrame = { event: string; data: string };

/** Whole frames, and whatever is left of a frame still arriving. */
export type SseRead = { frames: SseFrame[]; rest: string };

/**
 * Split what has arrived so far into whole frames plus the remainder.
 *
 * The caller keeps `rest` and prepends it to the next chunk. A chunk
 * boundary falls wherever the network puts it, including inside a field
 * name, so nothing is parsed until its blank line has arrived.
 */
export function readFrames(buffer: string): SseRead {
	// Normalised once here rather than in every comparison below. A chunk
	// may end between the carriage return and the newline, and the lone
	// carriage return then survives in `rest` and joins its newline next time.
	const text = buffer.replace(/\r\n/g, '\n');
	const frames: SseFrame[] = [];
	let start = 0;

	for (;;) {
		const end = text.indexOf('\n\n', start);
		if (end === -1) break;

		const frame = parseFrame(text.slice(start, end));
		if (frame) frames.push(frame);
		start = end + 2;
	}

	return { frames, rest: text.slice(start) };
}

function parseFrame(block: string): SseFrame | null {
	let event = '';
	const data: string[] = [];

	for (const line of block.split('\n')) {
		// A line starting with a colon is a comment. Servers send one as a
		// keep-alive, so it is common rather than exotic.
		if (line === '' || line.startsWith(':')) continue;

		const colon = line.indexOf(':');
		const field = colon === -1 ? line : line.slice(0, colon);
		const raw = colon === -1 ? '' : line.slice(colon + 1);
		const value = raw.startsWith(' ') ? raw.slice(1) : raw;

		if (field === 'event') event = value;
		else if (field === 'data') data.push(value);
	}

	if (event === '' && data.length === 0) return null;

	return { event: event === '' ? 'message' : event, data: data.join('\n') };
}

/** One frame, ready to write. Multi-line data takes one `data:` line each. */
export function formatFrame(event: string, data: string): string {
	const lines = data.split('\n').map((line) => `data: ${line}`);
	return `event: ${event}\n${lines.join('\n')}\n\n`;
}

// ------------------------------------------------------------------- the turn

export type TurnStatus = 'idle' | 'sending' | 'streaming' | 'done' | 'stopped' | 'failed';

export type Turn = {
	status: TurnStatus;
	/** The assistant's text so far. Kept on stop: a partial reply is a reply. */
	text: string;
	messageId: string | null;
	errorCode: string | null;
};

export const IDLE_TURN: Turn = { status: 'idle', text: '', messageId: null, errorCode: null };

export type TurnInput =
	| { kind: 'send' }
	| { kind: 'frame'; frame: SseFrame }
	| { kind: 'stop' }
	| { kind: 'failed'; code: string };

/** Whether the turn is still expecting events. */
export function isActive(turn: Turn): boolean {
	return turn.status === 'sending' || turn.status === 'streaming';
}

/**
 * The turn, one input at a time.
 *
 * The rule that matters is the guard: once a turn has stopped, finished or
 * failed, nothing reopens it. Aborting closes the connection, but a frame
 * already in the browser's buffer still arrives afterwards, and appending it
 * would make the stop button look ignored.
 */
export function advance(turn: Turn, input: TurnInput): Turn {
	if (input.kind === 'send') {
		return { status: 'sending', text: '', messageId: null, errorCode: null };
	}

	if (!isActive(turn)) return turn;

	if (input.kind === 'stop') return { ...turn, status: 'stopped' };
	if (input.kind === 'failed') return { ...turn, status: 'failed', errorCode: input.code };

	const payload = readPayload(input.frame.data);

	switch (input.frame.event) {
		case 'token':
			return { ...turn, status: 'streaming', text: turn.text + text(payload.text) };
		case 'done':
			return { ...turn, status: 'done', messageId: text(payload.message_id) || null };
		case 'error':
			return { ...turn, status: 'failed', errorCode: text(payload.code) || 'STREAM_FAILED' };
		default:
			// `tool_call`, `tool_result` and `receipt_draft` render with the
			// tool loop in US-030. Ignored here rather than guessed at.
			return turn;
	}
}

/**
 * A malformed payload is dropped, not thrown.
 *
 * The page is holding a half-written answer on screen. Taking the component
 * down over one bad frame loses the rest of it.
 */
function readPayload(data: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(data);
		return typeof parsed === 'object' && parsed !== null
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

// --------------------------------------------------------------- the composer

/** One comfortable line, plus the field's padding. */
export const COMPOSER_MIN_HEIGHT = 56;

/** Roughly eight lines. Past that the conversation matters more than the draft. */
export const COMPOSER_MAX_HEIGHT = 200;

export type ComposerSize = { height: number; scroll: boolean };

/**
 * How tall the composer should be for the text it holds.
 *
 * Measured height in, applied height out. The caller reads `scrollHeight`
 * because wrapped text has no height until it is laid out; the rule itself
 * is here so it can be checked without a browser.
 */
export function composerHeight(
	scrollHeight: number,
	min = COMPOSER_MIN_HEIGHT,
	max = COMPOSER_MAX_HEIGHT
): ComposerSize {
	if (!Number.isFinite(scrollHeight) || scrollHeight < min) {
		return { height: min, scroll: false };
	}

	if (scrollHeight > max) return { height: max, scroll: true };

	return { height: Math.ceil(scrollHeight), scroll: false };
}
