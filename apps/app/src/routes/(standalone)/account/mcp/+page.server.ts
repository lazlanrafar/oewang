import { fail, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { run, text } from '$lib/server/form-action';
import * as mcp from '$lib/server/mcp';

import type { PageServerLoad } from './$types';

/**
 * MCP in the account area (D106): how to connect an AI app, and the tokens
 * that let it act as this person. Tokens belong to the person, not to a
 * workspace, which is why this is here and not in a workspace's settings.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const tokens = await mcp.listTokens(locals.accessToken).catch(() => null);
	return {
		tokens: tokens?.data ?? [],
		mcpUrl: `${url.origin}/mcp`
	};
};

const EXPIRY = new Set(['30', '90', '365']);

export const actions: Actions = {
	/** The token comes back to the page once; it is never readable again. */
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const expiry = text(form, 'expires_in_days');
		const scope = text(form, 'scope');
		const workspaceIds = form.getAll('workspace_ids').map(String).filter(Boolean);

		try {
			const created = await mcp.createToken(
				{
					name: text(form, 'name'),
					workspace_ids: scope === 'some' ? workspaceIds : null,
					expires_in_days: EXPIRY.has(expiry) ? Number(expiry) : null
				},
				locals.accessToken
			);
			return { ok: true, secret: created.data!.secret };
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, { code: error.code, fields: error.fields });
			}
			throw error;
		}
	},

	revoke: async ({ request, locals }) =>
		run(request, (form) => mcp.revokeToken(text(form, 'id'), locals.accessToken))
};
