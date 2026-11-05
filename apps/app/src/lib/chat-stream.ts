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

import { readArtifact } from '$lib/artifacts';
import type { ToolCall } from '$lib/chat-tools';

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

export type TokenUsage = { input: number; output: number };

export type Turn = {
	status: TurnStatus;
	/** The assistant's text so far. Kept on stop: a partial reply is a reply. */
	text: string;
	/**
	 * The text since the most recent tool call, which is all the screen
	 * shows while the turn is working. See `visibleText`.
	 */
	textSinceTool: string;
	/** Every tool the model has asked for this turn, in order (CHAT-14). */
	toolCalls: ToolCall[];
	/** A parsed receipt, waiting for the panel US-034 mounts. */
	receiptDraft: Record<string, unknown> | null;
	usage: TokenUsage | null;
	messageId: string | null;
	errorCode: string | null;
};

export const IDLE_TURN: Turn = {
	status: 'idle',
	text: '',
	textSinceTool: '',
	toolCalls: [],
	receiptDraft: null,
	usage: null,
	messageId: null,
	errorCode: null
};

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
	if (input.kind === 'send') return { ...IDLE_TURN, status: 'sending' };

	if (!isActive(turn)) return turn;

	if (input.kind === 'stop') return { ...turn, status: 'stopped' };
	if (input.kind === 'failed') return { ...turn, status: 'failed', errorCode: input.code };

	const payload = readPayload(input.frame.data);

	switch (input.frame.event) {
		case 'token': {
			const chunk = text(payload.text);
			return {
				...turn,
				status: 'streaming',
				text: turn.text + chunk,
				textSinceTool: turn.textSinceTool + chunk
			};
		}
		case 'tool_call': {
			const call = readToolCall(payload);
			if (!call) return turn;

			return {
				...turn,
				status: 'streaming',
				// Two rounds of the model, kept as two paragraphs. The API
				// stores the reply the same way.
				text: turn.text.trim() !== '' ? `${turn.text.trimEnd()}\n\n` : turn.text,
				toolCalls: [...turn.toolCalls, call],
				// The narration that led up to this call stops being the
				// latest thing said, which is what `visibleText` reads.
				textSinceTool: ''
			};
		}
		case 'tool_result': {
			const id = text(payload.id);
			// A result for a call that never arrived is a protocol error.
			// Inventing the call it belongs to would put a tool nobody asked
			// for on the screen, so it is dropped.
			if (!turn.toolCalls.some((call) => call.id === id)) return turn;

			return {
				...turn,
				toolCalls: turn.toolCalls.map((call) =>
					call.id === id
						? {
								...call,
								status: payload.ok === true ? 'ok' : 'failed',
								summary: text(payload.summary) || null
							}
						: call
				)
			};
		}
		case 'artifact': {
			// Sent by the API right after its tool's result (D88). One for a
			// call this turn never made is dropped, like a stray result.
			const id = text(payload.id);
			const artifact = readArtifact(payload.type, payload.payload);
			if (!artifact || !turn.toolCalls.some((call) => call.id === id)) return turn;

			return {
				...turn,
				toolCalls: turn.toolCalls.map((call) => (call.id === id ? { ...call, artifact } : call))
			};
		}
		case 'receipt_draft': {
			const draft = payload.draft;
			return typeof draft === 'object' && draft !== null && !Array.isArray(draft)
				? { ...turn, receiptDraft: draft as Record<string, unknown> }
				: turn;
		}
		case 'done':
			return {
				...turn,
				status: 'done',
				messageId: text(payload.message_id) || null,
				usage: readUsage(payload.usage)
			};
		case 'error':
			return { ...turn, status: 'failed', errorCode: text(payload.code) || 'STREAM_FAILED' };
		default:
			// An event this version does not know is ignored rather than
			// guessed at. The protocol gains events; a turn should not break
			// because the service is one deploy ahead.
			return turn;
	}
}

/** Whether a tool the model asked for has yet to answer. */
export function toolsRunning(turn: Turn): boolean {
	return turn.toolCalls.some((call) => call.status === 'running');
}

/**
 * The assistant text the screen shows (CHAT-14).
 *
 * **Text that arrived before the last tool call is suppressed while the
 * turn is still working.** The prompt tells the model not to narrate each
 * call; the prompt alone does not hold, and a sentence like "Let me check
 * your wallets" between two tool cards is noise the user never asked for
 * ([research](../../../docs/research/midday.md#16-tool-call-presentation)).
 *
 * Two details are deliberate:
 *
 * - The suppression lasts for the whole working turn, not only while a
 *   call is unanswered. Lifting it between rounds would flash the
 *   narration back on screen each time a result arrived.
 * - It ends when the turn does. The API persists everything the model
 *   wrote, so the stored message that replaces this one a moment later
 *   contains the narration anyway; hiding it to the end would make the two
 *   disagree for no gain.
 */
export function visibleText(turn: Turn): string {
	const working = isActive(turn) && turn.toolCalls.length > 0;
	return working ? turn.textSinceTool : turn.text;
}

function readToolCall(payload: Record<string, unknown>): ToolCall | null {
	const id = text(payload.id);
	const name = text(payload.name);
	if (id === '' || name === '') return null;

	const args = payload.args;

	return {
		id,
		name,
		args:
			typeof args === 'object' && args !== null && !Array.isArray(args)
				? (args as Record<string, unknown>)
				: {},
		status: 'running',
		summary: null,
		artifact: null
	};
}

function readUsage(value: unknown): TokenUsage | null {
	if (typeof value !== 'object' || value === null) return null;

	const usage = value as Record<string, unknown>;
	const input = usage.input;
	const output = usage.output;

	return typeof input === 'number' && typeof output === 'number' ? { input, output } : null;
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

/**
 * What a working turn is doing when nothing new is on screen yet.
 *
 * - `thinking`: sent, and neither a tool nor a word has come back.
 * - `working`: a tool is running; the tool's own line says which.
 * - `reading`: every tool has answered and the model has not started writing.
 *
 * `null` once words are arriving, or once the turn is over: the text is then
 * the progress, and a status beside it would only repeat it.
 */
export type TurnPhase = 'thinking' | 'working' | 'reading';

export function turnPhase(turn: Turn): TurnPhase | null {
	if (!isActive(turn)) return null;
	if (toolsRunning(turn)) return 'working';
	if (visibleText(turn) !== '') return null;
	return turn.toolCalls.length > 0 ? 'reading' : 'thinking';
}
