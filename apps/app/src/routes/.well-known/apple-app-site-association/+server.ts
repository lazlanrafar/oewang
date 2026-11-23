import type { RequestHandler } from '@sveltejs/kit';

/** Team ID and bundle ID of the store app (D113, docs/features/mobile.md). */
const IOS_APP_ID = 'P9VXA8S55P.com.oewang.app';

/**
 * Lets the iOS app open invitation links (MOB-9) and use passkeys for this
 * domain (D110). Apple fetches it without cookies and wants plain JSON.
 */
export const GET: RequestHandler = () =>
	Response.json({
		applinks: {
			details: [{ appIDs: [IOS_APP_ID], components: [{ '/': '/accept-invite*' }] }]
		},
		webcredentials: { apps: [IOS_APP_ID] }
	});
