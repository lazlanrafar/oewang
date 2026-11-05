import { describe, expect, it } from 'vitest';

import { canvasParams, isArtifactCanvas, readCanvas, type CanvasState } from './canvas';

const at = (query: string) => new URL(`https://oewang.test/chat/clx1${query}`);

describe('readCanvas', () => {
	it('reads a kind and an id', () => {
		expect(readCanvas(at('?canvas=receipt&id=clxfile'))).toEqual({
			kind: 'receipt',
			id: 'clxfile'
		});
		expect(readCanvas(at('?canvas=transaction&id=clxfile'))).toEqual({
			kind: 'transaction',
			id: 'clxfile'
		});
	});

	it('opens nothing for a kind this app does not have', () => {
		// A URL is user input, and an open panel with nothing in it is a
		// worse answer to a mistyped link than no panel.
		expect(readCanvas(at('?canvas=nonsense&id=clxfile'))).toBeNull();
		expect(readCanvas(at('?canvas=&id=clxfile'))).toBeNull();
	});

	it('opens nothing without an id', () => {
		expect(readCanvas(at('?canvas=receipt'))).toBeNull();
		expect(readCanvas(at('?canvas=receipt&id='))).toBeNull();
	});

	it('opens nothing on a plain URL', () => {
		expect(readCanvas(at(''))).toBeNull();
		expect(readCanvas(at('?detail=clx9'))).toBeNull();
	});
});

describe('canvasParams', () => {
	it('writes the kind and the id', () => {
		const state: CanvasState = { kind: 'receipt', id: 'clxfile' };
		expect(canvasParams(state)).toEqual({ canvas: 'receipt', id: 'clxfile' });
	});

	it('clears both parameters when nothing is open', () => {
		// `writeParams` deletes on null, so closing leaves no `?canvas=`.
		expect(canvasParams(null)).toEqual({ canvas: null, id: null });
	});

	it('round-trips through a URL', () => {
		const state: CanvasState = { kind: 'transaction', id: 'clxfile' };
		const params = canvasParams(state);
		const url = at(`?canvas=${params.canvas}&id=${params.id}`);

		expect(readCanvas(url)).toEqual(state);
	});
});

describe('analysis canvases (D88)', () => {
	it('reads each analysis kind, keyed by its tool call', () => {
		for (const kind of ['spending', 'income', 'burn-rate']) {
			const state = readCanvas(at(`?canvas=${kind}&id=toolu_1`));
			expect(state).toEqual({ kind, id: 'toolu_1' });
			expect(isArtifactCanvas(state)).toBe(true);
		}
	});

	it('does not treat the receipt or the form as an analysis', () => {
		expect(isArtifactCanvas(readCanvas(at('?canvas=receipt&id=clxfile')))).toBe(false);
		expect(isArtifactCanvas(null)).toBe(false);
	});
});
