import { beforeEach, describe, expect, it, vi } from 'vitest';

const ledger = vi.hoisted(() => ({ readTransaction: vi.fn(), updateTransaction: vi.fn() }));
vi.mock('$lib/server/ledger', async (original) => ({
	...(await original<typeof import('$lib/server/ledger')>()),
	...ledger
}));

import { actions } from './+page.server';

type Action = (event: { request: Request; locals: { accessToken?: string } }) => Promise<unknown>;

function submit(action: string, fields: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const request = new Request('http://localhost/transactions', { method: 'POST', body });
	return (actions[action as keyof typeof actions] as unknown as Action)({ request, locals: {} });
}

function sentRate() {
	return ledger.updateTransaction.mock.calls[0][1].base_rate;
}

// TXN-22
describe('resave', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ledger.updateTransaction.mockResolvedValue({ data: {} });
		ledger.readTransaction.mockResolvedValue({
			data: { type: 'expense', wallet_id: 'w1', amount: '10.00', base_rate: '16250', base_rate_source: 'user' }
		});
	});

	it('should keep a confirmed rate when the wallet stays', async () => {
		await submit('setAttachments', { id: 't1' });
		expect(sentRate()).toBe('16250');
	});

	it('should let the API resolve a fresh rate when the wallet changes', async () => {
		await submit('setWallet', { id: 't1', wallet_id: 'w2' });
		expect(sentRate()).toBeNull();
	});
});
