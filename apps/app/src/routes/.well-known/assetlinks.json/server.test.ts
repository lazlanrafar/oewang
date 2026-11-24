import { afterEach, describe, expect, it } from 'vitest';

import { GET } from './+server';

const SAMPLE =
	'14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5';
const OTHER = SAMPLE.replace('14', 'AB');

async function body() {
	const res = await GET({} as Parameters<typeof GET>[0]);
	expect(res.headers.get('content-type')).toContain('application/json');
	return res.json();
}

describe('assetlinks.json (MOB-9, D119)', () => {
	afterEach(() => {
		delete process.env.ANDROID_CERT_SHA256;
	});

	it('vouches for no app until a fingerprint is configured', async () => {
		expect(await body()).toEqual([]);
		process.env.ANDROID_CERT_SHA256 = ' , not-a-fingerprint';
		expect(await body()).toEqual([]);
	});

	it('lets the Android app open links and use passkeys with each configured key', async () => {
		process.env.ANDROID_CERT_SHA256 = `${SAMPLE.toLowerCase()}, ${OTHER}`;
		expect(await body()).toEqual([
			{
				relation: [
					'delegate_permission/common.handle_all_urls',
					'delegate_permission/common.get_login_creds'
				],
				target: {
					namespace: 'android_app',
					package_name: 'com.oewang.app',
					sha256_cert_fingerprints: [SAMPLE, OTHER]
				}
			}
		]);
	});
});
