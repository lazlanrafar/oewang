import { fail, redirect, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import * as chat from '$lib/server/chat';

import type { PageServerLoad } from './$types';

/**
 * `/chat` opens the newest conversation, or an empty one when there is
 * none (docs/features/chat.md#sessions).
 */
export const load: PageServerLoad = async ({ parent }) => {
	const { sessions } = await parent();

	// The list is already ordered by activity, so the first row is the
	// conversation the user was last in.
	if (sessions.length > 0) redirect(303, `/chat/${sessions[0].id}`);

	return {};
};

/**
 * Every chat mutation, in one place.
 *
 * The sidebar lives in the layout and a layout cannot own actions, so the
 * forms post here from whichever conversation is open. Each action ends in
 * its own redirect, which also keeps this route's "open the newest one"
 * load out of the way.
 */
export const actions: Actions = {
	new: async ({ request, locals }) => {
		const form = await request.formData();
		const title = text(form, 'title');

		let created;
		try {
			created = await chat.createSession(title === '' ? null : title, locals.accessToken);
		} catch (error) {
			return failure(error);
		}

		redirect(303, `/chat/${created.data?.id}`);
	},

	rename: async ({ request, locals }) => {
		const form = await request.formData();
		const id = text(form, 'id');

		try {
			await chat.renameSession(id, text(form, 'title'), locals.accessToken);
		} catch (error) {
			return failure(error);
		}

		redirect(303, backTo(form, `/chat/${id}`));
	},

	delete: async ({ request, locals }) => {
		const form = await request.formData();
		const id = text(form, 'id');

		try {
			await chat.deleteSession(id, locals.accessToken);
		} catch (error) {
			return failure(error);
		}

		// Back where the list was opened, unless that was the conversation
		// just deleted: then `/chat`, which opens whatever is newest now.
		const back = backTo(form, '/chat');
		redirect(303, back.startsWith(`/chat/${id}`) ? '/chat' : back);
	}
};

/**
 * Where to land after an action, from the form's `back` field (D87).
 *
 * The list opens from the overview as well as from a conversation, and
 * renaming from the overview should leave the reader there. Only a path on
 * this site is followed: `//evil.test` and `/\evil.test` read as another
 * origin to a browser, so anything but a single leading slash falls back.
 */
function backTo(form: FormData, fallback: string): string {
	const back = text(form, 'back');
	return /^\/(?![/\\])/.test(back) ? back : fallback;
}

function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}

function failure(error: unknown) {
	if (error instanceof ApiError) {
		return fail(error.status, { code: error.code, fields: error.fields });
	}
	throw error;
}
