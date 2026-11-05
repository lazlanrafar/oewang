import { fail, type Actions } from '@sveltejs/kit';

import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { ApiError } from '$lib/server/api';
import { workspaceUsage } from '$lib/server/usage';
import * as vault from '$lib/server/vault';
import { VAULT_PAGE_SIZE } from '$lib/files';

import type { PageServerLoad } from './$types';

/**
 * The vault (D90, VLT-6).
 *
 * The search lives in the URL, so a filtered view can be shared and restored
 * (UI-8, D55), and the open file does too (`?file=`), so a reload keeps the
 * sheet. The first page is read here; the next ones are fetched as the grid
 * scrolls, through the same list the picker uses.
 */
export const load: PageServerLoad = async ({ depends, locals, url }) => {
	const token = locals.accessToken;
	depends(INVALIDATION_KEYS.vault);

	const search = (url.searchParams.get('search') ?? '').trim();
	const fileId = url.searchParams.get('file');

	const [files, usage, file] = await Promise.all([
		vault.listFiles({ search, page: 1, limit: VAULT_PAGE_SIZE }, token),
		workspaceUsage(token).catch(() => null),
		fileId ? vault.readFile(fileId, token).catch(() => null) : null
	]);

	return {
		files: files.data ?? [],
		totalPages: files.meta.total_pages ?? 1,
		storage: usage?.data?.storage ?? null,
		file: file?.data ?? null,
		search
	};
};

export const actions: Actions = {
	/**
	 * Rename, retag, or both. A field the form did not carry is left alone:
	 * `tags_set` marks that the tag inputs are the whole set, so removing the
	 * last tag still means "none" (VLT-8, VLT-9).
	 */
	update: async ({ request, locals }) =>
		run(request, (form) => {
			const body: { name?: string; tags?: string[] } = {};
			if (form.has('name')) body.name = String(form.get('name') ?? '').trim();
			if (form.has('tags_set')) {
				body.tags = form
					.getAll('tags')
					.map((value) => String(value).trim())
					.filter(Boolean);
			}
			return vault.updateFile(String(form.get('id') ?? ''), body, locals.accessToken);
		}),

	/** Soft delete, detaching it from every transaction (VLT-11). */
	delete: async ({ request, locals }) =>
		run(request, (form) => vault.deleteFile(String(form.get('id') ?? ''), locals.accessToken))
};

async function run(request: Request, call: (form: FormData) => Promise<unknown>) {
	const form = await request.formData();

	try {
		await call(form);
		return { ok: true };
	} catch (error) {
		if (error instanceof ApiError) {
			return fail(error.status, { code: error.code, fields: error.fields });
		}
		throw error;
	}
}
