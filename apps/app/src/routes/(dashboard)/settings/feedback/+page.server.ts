import type { Actions } from '@sveltejs/kit';

import { run, text } from '$lib/server/form-action';
import { sendFeedback, type FeedbackType } from '$lib/server/workspaces';

const TYPES: FeedbackType[] = ['bug', 'feature', 'other'];

/** Feedback (FB-1, D104), stored by the API with who sent it. Any role. */
export const actions: Actions = {
	send: async ({ request, locals }) =>
		run(request, (form) => {
			const type = text(form, 'type');
			return sendFeedback(
				{
					// A `<select>` is user input like any other.
					type: (TYPES as string[]).includes(type) ? (type as FeedbackType) : 'other',
					message: text(form, 'message')
				},
				locals.accessToken
			);
		})
};
