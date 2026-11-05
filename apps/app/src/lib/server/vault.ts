/**
 * Typed calls to the vault endpoints (D90).
 *
 * Server only, like everything under `src/lib/server`. File bytes travel as
 * base64 inside the OWE1 envelope, chunk by chunk; nothing here ever holds an
 * object-storage URL (D23, VLT-3).
 */

import { api } from './api';

export type VaultFile = {
	id: string;
	name: string;
	size: number;
	type: string;
	sha256: string | null;
	status: 'pending' | 'ready';
	tags: string[];
	/** `false` when no preview can be made; `null` until first asked for (D91). */
	thumbnail: boolean | null;
	created_at: string;
};

/** One row of the vault list (VLT-6). */
export type VaultListFile = {
	id: string;
	name: string;
	size: number;
	type: string;
	tags: string[];
	thumbnail: boolean | null;
	/** Live transactions carrying this file. */
	used_by: number;
	created_at: string;
};

/** A transaction that carries a file, for the file sheet (VLT-10). */
export type LinkedTransaction = {
	id: string;
	name: string | null;
	date: string;
	type: 'income' | 'expense' | 'transfer';
	/** A decimal string in the wallet's currency (D12). */
	amount: string;
	currency_code: string;
};

export type VaultFileDetail = VaultFile & {
	used_by: number;
	transactions: LinkedTransaction[];
};

export type VaultQuery = {
	search?: string;
	type?: 'image' | 'pdf';
	size?: 'lt1' | '1to5' | 'gt5';
	tag?: string;
	sort?: 'newest' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';
	page?: number;
	limit?: number;
};

/**
 * The filters as a query. Passed to `api` as `query` rather than appended to
 * the path: the query travels sealed in a header, never in the URL (D22).
 */
function query(params: VaultQuery): URLSearchParams {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== '') search.set(key, String(value));
	}
	return search;
}

export function listFiles(params: VaultQuery, token?: string) {
	return api<VaultListFile[]>({ path: '/v1/vault/files', query: query(params), token });
}

export function readFile(fileId: string, token?: string) {
	return api<VaultFileDetail>({ path: `/v1/vault/files/${fileId}`, token });
}

/** Rename, retag, or both. An absent field is left alone (VLT-8, VLT-9). */
export function updateFile(
	fileId: string,
	body: { name?: string; tags?: string[] },
	token?: string
) {
	return api<VaultFile>({ method: 'PATCH', path: `/v1/vault/files/${fileId}`, body, token });
}

/** Soft delete, detaching it from every transaction (VLT-11). */
export function deleteFile(fileId: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/vault/files/${fileId}`, token });
}

/** A small square JPEG, base64 (D91). */
export function readThumbnail(fileId: string, token?: string) {
	return api<{ type: string; data: string }>({
		path: `/v1/vault/files/${fileId}/thumbnail`,
		token
	});
}

export type BegunUpload = {
	id: string;
	chunk_size: number;
	chunk_count: number;
	status: string;
};

/**
 * Start an upload (VLT-1).
 *
 * Nothing is stored yet: the row exists so a chunk can be addressed, and
 * stays pending until the bytes have been checked against what was
 * declared.
 */
export function beginUpload(
	body: { filename: string; content_type: string; size_bytes: number },
	token?: string
) {
	return api<BegunUpload>({ method: 'POST', path: '/v1/vault/files', body, token });
}

/** One chunk, base64 inside the envelope. Never a signed URL (D23). */
export function putChunk(fileId: string, index: number, data: string, token?: string) {
	return api<null>({
		method: 'PUT',
		path: `/v1/vault/files/${fileId}/chunks/${index}`,
		body: { data },
		token
	});
}

export function completeUpload(fileId: string, token?: string) {
	return api<VaultFile>({
		method: 'POST',
		path: `/v1/vault/files/${fileId}/complete`,
		token
	});
}

export function readChunk(fileId: string, index: number, token?: string) {
	return api<{ index: number; data: string }>({
		path: `/v1/vault/files/${fileId}/chunks/${index}`,
		token
	});
}
