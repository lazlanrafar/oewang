import { describe, expect, it } from 'vitest';

import { messageForCode, parseRefusal, planRefusalMessage } from './errors';

describe('plan refusals (PLN-7)', () => {
	it('says each plan code plainly', () => {
		expect(messageForCode('QUOTA_TOKENS_EXCEEDED')).toMatch(/used its AI tokens for this month/);
		expect(messageForCode('QUOTA_STORAGE_EXCEEDED')).toMatch(/no storage left/);
		expect(messageForCode('FEATURE_NOT_IN_PLAN')).toMatch(/does not include this/);
	});

	it('names the feature a plan left out', () => {
		expect(messageForCode('FEATURE_NOT_IN_PLAN', 'vault')).toMatch(/does not include Vault\./);
	});

	it('falls back to the generic sentence for a feature this build does not know', () => {
		expect(messageForCode('FEATURE_NOT_IN_PLAN', 'invoices')).toBe(messageForCode('FEATURE_NOT_IN_PLAN'));
	});

	it('ignores a feature on any other code', () => {
		expect(messageForCode('RATE_LIMITED', 'chat')).toBe(messageForCode('RATE_LIMITED'));
	});
});

describe('parseRefusal', () => {
	it("reads the code and feature from error()'s body", () => {
		expect(parseRefusal({ message: 'FEATURE_NOT_IN_PLAN', feature: 'chat' })).toEqual({
			code: 'FEATURE_NOT_IN_PLAN',
			feature: 'chat'
		});
		expect(parseRefusal({ message: 'RATE_LIMITED' })).toEqual({ code: 'RATE_LIMITED' });
	});

	it('reads anything else as a failed request', () => {
		expect(parseRefusal(null)).toEqual({ code: 'STREAM_FAILED' });
		expect(parseRefusal('nope')).toEqual({ code: 'STREAM_FAILED' });
	});
});

describe('planRefusalMessage (PLN-7)', () => {
	it('turns an upload refused by the plan into its sentence', () => {
		expect(planRefusalMessage('{"message":"QUOTA_STORAGE_EXCEEDED"}')).toMatch(/no storage left/);
		expect(planRefusalMessage('{"message":"FEATURE_NOT_IN_PLAN","feature":"vault"}')).toMatch(/Vault/);
	});

	it('leaves every other failure to the caller', () => {
		expect(planRefusalMessage('{"message":"FILE_TOO_LARGE"}')).toBeNull();
		expect(planRefusalMessage('Internal Error')).toBeNull();
	});
});
