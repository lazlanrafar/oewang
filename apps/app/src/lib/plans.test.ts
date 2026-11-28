import { describe, expect, it } from 'vitest';

import { limitPercent, missingFeature, notInPlan } from './plans';

describe('missingFeature (PLN-7)', () => {
	it('names the first needed feature the plan leaves out', () => {
		expect(missingFeature(['chat', 'vault'], ['receipt_scan', 'vault'])).toBe('receipt_scan');
		expect(missingFeature(['receipt_scan'], ['receipt_scan', 'vault'])).toBe('vault');
	});

	it('is null when the plan holds every needed feature', () => {
		expect(missingFeature(['receipt_scan', 'vault', 'chat'], ['receipt_scan', 'vault'])).toBeNull();
	});

	it('withholds nothing when the plan could not be read: the API still refuses', () => {
		expect(missingFeature(null, ['chat'])).toBeNull();
	});
});

describe('notInPlan (PLN-7)', () => {
	it('names the feature by its label', () => {
		expect(notInPlan('receipt_scan')).toBe("Receipt scan is not in this workspace's plan.");
	});
});

describe('limitPercent (PLN-7)', () => {
	it('measures against the limit, past it over 100', () => {
		expect(limitPercent(250_000, 500_000)).toBe(50);
		expect(limitPercent(750_000, 500_000)).toBe(150);
	});

	it('is null for an unlimited limit, so no bar is drawn', () => {
		expect(limitPercent(123, null)).toBeNull();
	});

	it('reads a zero limit as full', () => {
		expect(limitPercent(0, 0)).toBe(100);
	});
});
