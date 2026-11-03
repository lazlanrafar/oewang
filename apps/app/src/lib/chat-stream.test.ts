import { describe, expect, it } from 'vitest';

import {
	advance,
	composerHeight,
	formatFrame,
	IDLE_TURN,
	isActive,
	readFrames,
	type SseFrame,
	type Turn
} from './chat-stream';

function token(text: string): SseFrame {
	return { event: 'token', data: JSON.stringify({ text }) };
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

		expect(advance(failed, { kind: 'send' })).toEqual({
			status: 'sending',
			text: '',
			messageId: null,
			errorCode: null
		});
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

	it('passes over the events the tool loop brings in US-030', () => {
		const turn = advance(streaming(), {
			kind: 'frame',
			frame: { event: 'tool_call', data: '{"id":"t1","name":"get_spending_summary"}' }
		});

		expect(turn).toMatchObject({ status: 'streaming', text: 'You spent ' });
	});

	it('defaults a missing error code rather than rendering an empty message', () => {
		const turn = advance(streaming(), { kind: 'frame', frame: { event: 'error', data: '{}' } });

		expect(turn.errorCode).toBe('STREAM_FAILED');
	});
});

describe('composerHeight', () => {
	it('holds one line open at the minimum', () => {
		expect(composerHeight(20)).toEqual({ height: 56, scroll: false });
	});

	it('grows with the text', () => {
		expect(composerHeight(96)).toEqual({ height: 96, scroll: false });
	});

	it('stops growing and scrolls at the maximum', () => {
		expect(composerHeight(640)).toEqual({ height: 200, scroll: true });
	});

	it('rounds up, because a fractional height crops the last line', () => {
		expect(composerHeight(96.4).height).toBe(97);
	});

	it('takes a measurement that is not a number as empty', () => {
		expect(composerHeight(Number.NaN)).toEqual({ height: 56, scroll: false });
	});
});
