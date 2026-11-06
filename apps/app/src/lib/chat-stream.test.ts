import { describe, expect, it } from 'vitest';

import {
	advance,
	formatFrame,
	IDLE_TURN,
	isActive,
	readFrames,
	toolsRunning,
	turnPhase,
	visibleText,
	type SseFrame,
	type Turn
} from './chat-stream';

function token(text: string): SseFrame {
	return { event: 'token', data: JSON.stringify({ text }) };
}

function call(id: string, name: string): SseFrame {
	return { event: 'tool_call', data: JSON.stringify({ id, name, args: { amount: '50000' } }) };
}

function result(id: string, ok: boolean, summary: string): SseFrame {
	return { event: 'tool_result', data: JSON.stringify({ id, ok, summary }) };
}

/** A turn mid-answer, which is where every interesting transition starts. */
function streaming(text = 'You spent '): Turn {
	return advance(advance(IDLE_TURN, { kind: 'send' }), { kind: 'frame', frame: token(text) });
}

describe('readFrames', () => {
	it('reads whole frames and keeps the rest', () => {
		const result = readFrames('event: token\ndata: {"text":"Hi"}\n\nevent: token\ndata: {"te');

		expect(result.frames).toEqual([{ event: 'token', data: '{"text":"Hi"}' }]);
		expect(result.rest).toBe('event: token\ndata: {"te');
	});

	it('joins a frame split across two chunks', () => {
		const first = readFrames('event: to');
		const second = readFrames(first.rest + 'ken\ndata: {"text":"Hi"}\n\n');

		expect(first.frames).toEqual([]);
		expect(second.frames).toEqual([{ event: 'token', data: '{"text":"Hi"}' }]);
		expect(second.rest).toBe('');
	});

	it('accepts carriage returns, including one split from its newline', () => {
		const first = readFrames('event: done\r\ndata: {}\r');
		const second = readFrames(first.rest + '\n\r\n');

		expect(first.frames).toEqual([]);
		expect(second.frames).toEqual([{ event: 'done', data: '{}' }]);
	});

	it('skips a keep-alive comment', () => {
		expect(readFrames(': keep-alive\n\n').frames).toEqual([]);
	});

	it('joins several data lines with a newline', () => {
		expect(readFrames('event: token\ndata: one\ndata: two\n\n').frames).toEqual([
			{ event: 'token', data: 'one\ntwo' }
		]);
	});
});

describe('formatFrame', () => {
	it('round-trips through the reader', () => {
		const written = formatFrame('token', '{"text":"Hi"}');

		expect(readFrames(written).frames).toEqual([{ event: 'token', data: '{"text":"Hi"}' }]);
	});
});

describe('advance', () => {
	it('starts a turn clean, whatever the last one ended as', () => {
		const failed = advance(streaming(), { kind: 'failed', code: 'TOOL_FAILED' });

		expect(advance(failed, { kind: 'send' })).toEqual({ ...IDLE_TURN, status: 'sending' });
	});

	it('grows the answer token by token', () => {
		const turn = advance(streaming(), { kind: 'frame', frame: token('Rp 50.000.') });

		expect(turn.status).toBe('streaming');
		expect(turn.text).toBe('You spent Rp 50.000.');
	});

	it('ends on done, carrying the stored message id', () => {
		const turn = advance(streaming(), {
			kind: 'frame',
			frame: { event: 'done', data: '{"message_id":"clx1","usage":{"input":12,"output":3}}' }
		});

		expect(turn.status).toBe('done');
		expect(turn.messageId).toBe('clx1');
		expect(isActive(turn)).toBe(false);
	});

	it('ends on error, carrying the code the dictionary maps', () => {
		const turn = advance(streaming(), {
			kind: 'frame',
			frame: { event: 'error', data: '{"code":"TOOL_FAILED","message":"for logs"}' }
		});

		expect(turn).toMatchObject({ status: 'failed', errorCode: 'TOOL_FAILED' });
	});

	it('keeps the partial answer when the turn is stopped', () => {
		const turn = advance(streaming(), { kind: 'stop' });

		expect(turn).toMatchObject({ status: 'stopped', text: 'You spent ' });
	});

	it('ignores frames that arrive after a stop', () => {
		// Aborting closes the connection, but whatever is already buffered in
		// the browser still arrives. Appending it would ignore the button.
		const stopped = advance(streaming(), { kind: 'stop' });
		const later = advance(stopped, { kind: 'frame', frame: token('more') });

		expect(later).toBe(stopped);
	});

	it('ignores everything after done, including a failure', () => {
		const done = advance(streaming(), { kind: 'frame', frame: { event: 'done', data: '{}' } });

		expect(advance(done, { kind: 'failed', code: 'STREAM_FAILED' })).toBe(done);
		expect(advance(done, { kind: 'stop' })).toBe(done);
	});

	it('ignores an idle turn, so a late frame cannot start one', () => {
		expect(advance(IDLE_TURN, { kind: 'frame', frame: token('ghost') })).toBe(IDLE_TURN);
	});

	it('survives a malformed payload', () => {
		const turn = advance(streaming(), { kind: 'frame', frame: { event: 'token', data: 'not{' } });

		expect(turn.text).toBe('You spent ');
	});

	it('ignores an event it does not know, rather than breaking the turn', () => {
		// The protocol gains events. A turn should not end because the
		// service is one deploy ahead of the browser.
		const turn = advance(streaming(), {
			kind: 'frame',
			frame: { event: 'thinking', data: '{"text":"hmm"}' }
		});

		expect(turn).toMatchObject({ status: 'streaming', text: 'You spent ' });
	});

	it('defaults a missing error code rather than rendering an empty message', () => {
		const turn = advance(streaming(), { kind: 'frame', frame: { event: 'error', data: '{}' } });

		expect(turn.errorCode).toBe('STREAM_FAILED');
	});
});

describe('advance, the tool events', () => {
	it('records a call as running and its result as the API answered it', () => {
		const called = advance(streaming(), { kind: 'frame', frame: call('t1', 'create_transaction') });
		expect(called.toolCalls).toEqual([
			{
				id: 't1',
				name: 'create_transaction',
				args: { amount: '50000' },
				status: 'running',
				summary: null,
				artifact: null
			}
		]);

		const answered = advance(called, { kind: 'frame', frame: result('t1', true, 'Created.') });
		expect(answered.toolCalls[0]).toMatchObject({ status: 'ok', summary: 'Created.' });
	});

	it('attaches the artifact the API sent to the call that made it (D88)', () => {
		const called = advance(streaming(), {
			kind: 'frame',
			frame: call('t1', 'get_spending_analysis')
		});
		const payload = { from: '2026-11-01', to: '2026-11-30', total: { value: '1' } };
		const frame = (id: string, type: string) => ({
			event: 'artifact',
			data: JSON.stringify({ id, type, payload })
		});

		const shown = advance(called, { kind: 'frame', frame: frame('t1', 'spending') });
		expect(shown.toolCalls[0].artifact).toEqual({ kind: 'spending', payload });

		// A kind this app does not draw, and a call this turn never made.
		expect(advance(called, { kind: 'frame', frame: frame('t1', 'debt') })).toBe(called);
		expect(advance(called, { kind: 'frame', frame: frame('t9', 'spending') })).toBe(called);
	});

	it('marks a refused call as failed', () => {
		const called = advance(streaming(), { kind: 'frame', frame: call('t1', 'delete_transaction') });
		const refused = advance(called, { kind: 'frame', frame: result('t1', false, 'Not allowed.') });

		expect(refused.toolCalls[0].status).toBe('failed');
	});

	it('drops a result for a call that never arrived', () => {
		// A tool nobody asked for would otherwise appear on screen.
		const turn = advance(streaming(), { kind: 'frame', frame: result('ghost', true, 'x') });

		expect(turn.toolCalls).toEqual([]);
	});

	it('drops a call with no id or no name', () => {
		const turn = advance(streaming(), {
			kind: 'frame',
			frame: { event: 'tool_call', data: '{"name":"create_transaction"}' }
		});

		expect(turn.toolCalls).toEqual([]);
	});

	it('keeps the receipt draft for the panel that shows it', () => {
		const turn = advance(streaming(), {
			kind: 'frame',
			frame: { event: 'receipt_draft', data: '{"draft":{"merchant":"Warung Tekko"}}' }
		});

		expect(turn.receiptDraft).toEqual({ merchant: 'Warung Tekko' });
	});

	it('reads the usage reported with done', () => {
		const turn = advance(streaming(), {
			kind: 'frame',
			frame: { event: 'done', data: '{"message_id":"clx1","usage":{"input":1204,"output":311}}' }
		});

		expect(turn.usage).toEqual({ input: 1204, output: 311 });
	});
});

describe('visibleText', () => {
	it('shows everything when no tool was called', () => {
		expect(visibleText(streaming('You spent Rp 50.000.'))).toBe('You spent Rp 50.000.');
	});

	it('suppresses the narration that came before the last tool call', () => {
		// CHAT-14. The prompt tells the model not to narrate each call; the
		// prompt alone does not hold, so the screen does not show it.
		const narrated = streaming('Let me check your wallets. ');
		const called = advance(narrated, { kind: 'frame', frame: call('t1', 'get_recent_transactions') });
		const answering = advance(called, { kind: 'frame', frame: token('You spent Rp 50.000.') });

		expect(answering.text).toBe('Let me check your wallets.\n\nYou spent Rp 50.000.');
		expect(visibleText(answering)).toBe('You spent Rp 50.000.');
	});

	it('stays suppressed between rounds, so the narration does not flash back', () => {
		const called = advance(streaming('First I will look. '), {
			kind: 'frame',
			frame: call('t1', 'search_transactions')
		});
		const answered = advance(called, { kind: 'frame', frame: result('t1', true, '6 rows') });

		expect(toolsRunning(answered)).toBe(false);
		expect(visibleText(answered)).toBe('');
	});

	it('shows the whole answer once the turn ends', () => {
		// The API persisted all of it, and the stored message replaces this
		// one a moment later. Hiding it to the end would make the two
		// disagree for nothing.
		const called = advance(streaming('Let me check. '), {
			kind: 'frame',
			frame: call('t1', 'get_spending_summary')
		});
		const answered = advance(called, { kind: 'frame', frame: result('t1', true, '6 categories') });
		const spoken = advance(answered, { kind: 'frame', frame: token('You spent Rp 50.000.') });
		const done = advance(spoken, { kind: 'frame', frame: { event: 'done', data: '{}' } });

		expect(visibleText(done)).toBe('Let me check.\n\nYou spent Rp 50.000.');
	});

	it('shows what was said when a turn with tools is stopped', () => {
		const called = advance(streaming('Let me check. '), {
			kind: 'frame',
			frame: call('t1', 'get_spending_summary')
		});

		expect(visibleText(advance(called, { kind: 'stop' }))).toBe('Let me check.\n\n');
	});
});

describe('turnPhase', () => {
	it('is thinking before anything comes back, then working, then reading', () => {
		const sent = advance(IDLE_TURN, { kind: 'send' });
		expect(turnPhase(sent)).toBe('thinking');

		const working = advance(sent, { kind: 'frame', frame: call('t1', 'get_burn_rate') });
		expect(turnPhase(working)).toBe('working');

		const answered = advance(working, { kind: 'frame', frame: result('t1', true, 'Done.') });
		expect(turnPhase(answered)).toBe('reading');

		const writing = advance(answered, {
			kind: 'frame',
			frame: { event: 'token', data: JSON.stringify({ text: 'You spent' }) }
		});
		expect(turnPhase(writing)).toBeNull();
	});

	it('is nothing once the turn is over', () => {
		const sent = advance(IDLE_TURN, { kind: 'send' });
		expect(turnPhase(advance(sent, { kind: 'stop' }))).toBeNull();
	});
});

describe('text across tool rounds', () => {
	it('keeps the words before and after a tool call as two paragraphs', () => {
		const before = advance(advance(IDLE_TURN, { kind: 'send' }), {
			kind: 'frame',
			frame: { event: 'token', data: JSON.stringify({ text: 'Let me check.' }) }
		});
		const called = advance(before, { kind: 'frame', frame: call('t1', 'get_burn_rate') });
		const after = advance(called, {
			kind: 'frame',
			frame: { event: 'token', data: JSON.stringify({ text: 'Your burn rate' }) }
		});

		expect(after.text).toBe('Let me check.\n\nYour burn rate');
	});

	it('adds nothing when no words came before the call', () => {
		const called = advance(advance(IDLE_TURN, { kind: 'send' }), {
			kind: 'frame',
			frame: call('t1', 'get_burn_rate')
		});
		expect(called.text).toBe('');
	});
});
