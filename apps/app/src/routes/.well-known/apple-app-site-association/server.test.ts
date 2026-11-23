import { describe, expect, it } from 'vitest';

import { GET } from './+server';

const IOS_APP_ID = 'P9VXA8S55P.com.oewang.app';

describe('apple-app-site-association (MOB-9)', () => {
	it('lets the iOS app open invitation links and use passkeys here', async () => {
		const res = await GET({} as Parameters<typeof GET>[0]);
		expect(res.headers.get('content-type')).toContain('application/json');
		const body = await res.json();
		expect(body.applinks.details[0]).toEqual({
			appIDs: [IOS_APP_ID],
			components: [{ '/': '/accept-invite*' }]
		});
		expect(body.webcredentials.apps).toEqual([IOS_APP_ID]);
	});
});
