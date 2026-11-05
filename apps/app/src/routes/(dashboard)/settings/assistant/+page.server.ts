import type { Actions } from '@sveltejs/kit';

import { toResponseLanguage } from '$lib/ai-settings';
import * as chat from '$lib/server/chat';
import { run, text } from '$lib/server/form-action';
import type { PageServerLoad } from './$types';

/**
 * The agent settings (CHAT-10), a settings section since D82.
 *
 * Readable by any member: a member cannot change what the assistant is
 * told, but seeing it explains the answers they get.
 */
export const load: PageServerLoad = async ({ locals }) => ({
	assistant: await readAssistant(locals.accessToken)
});

/**
 * The agent settings, or null when they could not be read.
 *
 * Null rather than defaults, and the page says so rather than showing an
 * empty form. Rendering "nothing set" over a read that failed invites an
 * admin to save that over instructions which are actually in force.
 */
async function readAssistant(token?: string): Promise<chat.AgentSettings | null> {
	try {
		return (await chat.readSettings(token)).data ?? null;
	} catch {
		return null;
	}
}

export const actions: Actions = {
	/**
	 * Both fields go every time, because the form renders both. The
	 * instructions are sent trimmed: the API reads an empty or whitespace
	 * value as "clear it", which is what an emptied textarea means.
	 *
	 * The role is not checked here. `PATCH /v1/ai/settings` is admin and
	 * above and the API re-reads the membership row, so a member who posts
	 * this by hand is refused there (AUTH-4). The page hides the form
	 * because offering an edit that will be refused is bad manners, not
	 * because hiding it is the control.
	 */
	updateAssistant: async ({ request, locals }) =>
		run(request, (form) =>
			chat.updateSettings(
				{
					custom_instructions: text(form, 'custom_instructions'),
					// A `<select>` is user input like any other, and a value
					// the API does not know would be a 422 for a field the
					// user never typed in.
					response_language: toResponseLanguage(form.get('response_language'))
				},
				locals.accessToken
			)
		)
};
