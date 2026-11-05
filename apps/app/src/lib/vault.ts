/**
 * Vault writes from the browser (D90).
 *
 * The file sheet opens on two pages, the vault and transactions, and both
 * post to the vault page's own actions, so a rename means one action and one
 * set of rules wherever it is made. The server still does the talking (D5).
 */

import { deserialize } from '$app/forms';

export type VaultWriteResult = { ok: true } | { ok: false; code: string };

async function post(action: string, fields: [string, string][]): Promise<VaultWriteResult> {
	const body = new FormData();
	for (const [key, value] of fields) body.append(key, value);

	const response = await fetch(`/vault?/${action}`, {
		method: 'POST',
		body,
		headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
	});
	const result = deserialize(await response.text());

	if (result.type === 'success') return { ok: true };
	if (result.type === 'failure') {
		return { ok: false, code: String((result.data as { code?: string })?.code ?? 'ERROR') };
	}
	return { ok: false, code: 'ERROR' };
}

/** Rename, retag, or both (VLT-8, VLT-9). Tags are always the whole set. */
export function saveVaultFile(id: string, change: { name?: string; tags?: string[] }) {
	const fields: [string, string][] = [['id', id]];
	if (change.name !== undefined) fields.push(['name', change.name]);
	if (change.tags !== undefined) {
		fields.push(['tags_set', '1']);
		for (const tag of change.tags) fields.push(['tags', tag]);
	}
	return post('update', fields);
}

/** Delete a file, which also detaches it everywhere (VLT-11). */
export function deleteVaultFile(id: string) {
	return post('delete', [['id', id]]);
}
