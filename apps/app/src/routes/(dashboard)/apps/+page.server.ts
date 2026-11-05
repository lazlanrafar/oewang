import { fail, type Actions } from '@sveltejs/kit';
import QRCode from 'qrcode';

import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { ApiError } from '$lib/server/api';
import { run } from '$lib/server/form-action';
import * as integrations from '$lib/server/integrations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ depends, locals }) => {
	// The connect dialog polls this while it waits for `/start` (D85).
	depends(INVALIDATION_KEYS.integrations);

	const telegram = (await integrations.telegramStatus(locals.accessToken)).data;

	return {
		telegram: telegram ?? {
			enabled: false,
			bot_username: null,
			linked: false,
			telegram_username: null,
			linked_at: null
		}
	};
};

export const actions: Actions = {
	/**
	 * A one-time link to the bot, and its QR code.
	 *
	 * The QR is drawn here, from a link this server just received from the
	 * API, so the browser needs no QR library and no user text reaches the
	 * markup it renders. The link goes back in the action's answer only:
	 * never into the URL, because it is a credential for ten minutes.
	 */
	connect: async ({ locals }) => {
		try {
			const link = (await integrations.telegramLink(locals.accessToken)).data;
			if (!link) return fail(502, { code: 'INTERNAL_ERROR' });

			const qrSvg = await QRCode.toString(link.deep_link, {
				type: 'svg',
				margin: 1,
				errorCorrectionLevel: 'M'
			});

			return { link: { deepLink: link.deep_link, expiresAt: link.expires_at, qrSvg } };
		} catch (error) {
			if (error instanceof ApiError) return fail(error.status, { code: error.code });
			throw error;
		}
	},

	disconnect: async ({ request, locals }) => run(request, () => integrations.telegramUnlink(locals.accessToken))
};
