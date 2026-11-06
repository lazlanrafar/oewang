import { fail, type Actions } from '@sveltejs/kit';

import type { Role } from '$lib/server/account';
import { ApiError } from '$lib/server/api';
import { run, text } from '$lib/server/form-action';
import * as workspaces from '$lib/server/workspaces';
import { readText, readValues } from '$lib/url-state';

import type { PageServerLoad } from './$types';

const ROLES: Role[] = ['owner', 'admin', 'member'];

/**
 * Members and invitations (WS-3, WS-4, D104).
 *
 * Any member may see who is in the workspace. Invitations are read only
 * for an owner or an admin, because the API refuses them to anyone else;
 * asking anyway would turn every member's visit into a logged 403.
 *
 * Both lists are short, so the search and the role facet are applied here
 * rather than sent to the API, which has no filter for either.
 */
export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const { me } = await parent();
	const canManage = me.role !== 'member';

	const [members, invites] = await Promise.all([
		workspaces.listMembers(locals.accessToken),
		canManage ? workspaces.listInvites(locals.accessToken) : Promise.resolve({ data: [] })
	]);

	const search = readText(url, 'search').toLowerCase();
	const roles = readValues(url, 'role');
	const matches = (...fields: (string | null)[]) =>
		!search || fields.some((field) => field?.toLowerCase().includes(search));

	return {
		members: (members.data ?? []).filter(
			(member) =>
				matches(member.name, member.email) && (roles.length === 0 || roles.includes(member.role))
		),
		invites: (invites.data ?? []).filter((invite) => matches(invite.email)),
		filtered: !!search || roles.length > 0
	};
};

function role(form: FormData): Role {
	const value = text(form, 'role');
	// A value the API does not know is a 422 for a field nobody typed in.
	return (ROLES as string[]).includes(value) ? (value as Role) : 'member';
}

export const actions: Actions = {
	/**
	 * The invite link comes back to the page as well as by email: the token
	 * is readable only in this response, and a workspace without a mail key
	 * still needs a way to hand it over.
	 */
	invite: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email = text(form, 'email');

		try {
			const created = await workspaces.createInvite(
				{ email, role: role(form) },
				locals.accessToken
			);
			const invite = created.data!;
			return {
				ok: true,
				invited: invite.email,
				link: `${url.origin}/accept-invite?token=${encodeURIComponent(invite.token)}`
			};
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, { code: error.code, fields: error.fields, email });
			}
			throw error;
		}
	},

	role: async ({ request, locals }) =>
		run(request, (form) =>
			workspaces.updateMember(text(form, 'user_id'), role(form), locals.accessToken)
		),

	remove: async ({ request, locals }) =>
		run(request, (form) => workspaces.removeMember(text(form, 'user_id'), locals.accessToken)),

	revoke: async ({ request, locals }) =>
		run(request, (form) => workspaces.revokeInvite(text(form, 'id'), locals.accessToken))
};
