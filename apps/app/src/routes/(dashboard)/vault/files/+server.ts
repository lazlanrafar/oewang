import { error, json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { beginUpload, listFiles, type VaultQuery } from '$lib/server/vault';

import type { RequestHandler } from './$types';

/**
 * Start an upload (VLT-1, D23).
 *
 * The browser splits the file and sends chunks to the routes beside this
 * one; this server forwards each into the OWE1 envelope. The browser never
 * talks to the API, and no signed object-storage URL exists anywhere.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json()) as {
		filename?: string;
		content_type?: string;
		size_bytes?: number;
	};

	try {
		const result = await beginUpload(
			{
				filename: String(body.filename ?? 'file'),
				content_type: String(body.content_type ?? ''),
				size_bytes: Number(body.size_bytes ?? 0)
			},
			locals.accessToken
		);

		return json(result.data);
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};

const TYPES = ['image', 'pdf'] as const;
const SIZES = ['lt1', '1to5', 'gt5'] as const;
const SORTS = ['newest', 'name_asc', 'name_desc', 'size_desc', 'size_asc'] as const;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
	return allowed.find((candidate) => candidate === value);
}

/**
 * One page of the vault, as JSON, for the picker and for the grid's next
 * page (VLT-6). Every filter is the API's: nothing is narrowed here.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const params = url.searchParams;
	const query: VaultQuery = {
		search: params.get('search')?.trim() || undefined,
		type: pick(params.get('type'), TYPES),
		size: pick(params.get('size'), SIZES),
		sort: pick(params.get('sort'), SORTS),
		tag: params.get('tag')?.trim() || undefined,
		page: Math.max(1, Number(params.get('page') ?? 1) || 1),
		limit: Math.min(100, Math.max(1, Number(params.get('limit') ?? 15) || 15))
	};

	try {
		const result = await listFiles(query, locals.accessToken);
		return json({ files: result.data ?? [], total_pages: result.meta.total_pages ?? 1 });
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
