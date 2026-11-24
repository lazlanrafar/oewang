import { describe, expect, it } from 'vitest';

import { contactCounts } from './contacts';

describe('CON-2 the contact page counts', () => {
	const now = new Date(2026, 10, 24, 12);

	it('should count every contact, this month’s, and those with an email or a phone', () => {
		const counts = contactCounts(
			[
				{ email: 'ani@example.com', phone: null, created_at: new Date(2026, 10, 2).toISOString() },
				{ email: null, phone: '+62 811', created_at: new Date(2026, 9, 30).toISOString() },
				{ email: '  ', phone: '', created_at: new Date(2025, 10, 5).toISOString() }
			],
			now
		);
		expect(counts).toEqual({ total: 3, addedThisMonth: 1, withEmail: 1, withPhone: 1 });
	});

	it('should count nothing in an empty workspace', () => {
		expect(contactCounts([], now)).toEqual({ total: 0, addedThisMonth: 0, withEmail: 0, withPhone: 0 });
	});
});
