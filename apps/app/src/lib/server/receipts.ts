/**
 * Receipts waiting for the reader (D95). Server only.
 */

import { api } from './api';

/** The codes that mean "the reader did not answer", worth queuing. */
export const READER_BUSY_CODES = ['AI_UNAVAILABLE', 'EXTRACTION_NO_ANSWER'];

export type ReceiptNotice = {
	id: string;
	status: 'done' | 'failed';
	code: string | null;
	file_name: string;
	transaction_id: string | null;
	transaction_name: string | null;
	/** A decimal string (D12). */
	amount: string | null;
	currency_code: string | null;
};

export function queueReceipt(vaultFileId: string, token?: string) {
	return api<{ id: string; status: string; next_attempt_at: string }>({
		method: 'POST',
		path: '/v1/receipts/pending',
		body: { vault_file_id: vaultFileId },
		token
	});
}

export function receiptNotices(token?: string) {
	return api<ReceiptNotice[]>({ path: '/v1/receipts/notices', token });
}

export function markNoticesSeen(ids: string[], token?: string) {
	return api<null>({ method: 'POST', path: '/v1/receipts/notices/seen', body: { ids }, token });
}
