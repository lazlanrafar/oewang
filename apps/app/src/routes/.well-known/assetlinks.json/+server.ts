import type { RequestHandler } from '@sveltejs/kit';

/** Package name of the store app (D113, docs/features/mobile.md). */
const ANDROID_PACKAGE = 'com.oewang.app';

/** What keytool and Play Console print: 32 colon-separated hex pairs. */
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * Lets the Android app open invitation links (MOB-9) and use passkeys for
 * this domain (D119). `ANDROID_CERT_SHA256` holds the signing certificates'
 * fingerprints, comma-separated; without one this answers `[]`, which
 * vouches for no app. Google fetches it without cookies.
 */
export const GET: RequestHandler = () => {
	const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '')
		.split(',')
		.map((fingerprint) => fingerprint.trim().toUpperCase())
		.filter((fingerprint) => SHA256_FINGERPRINT.test(fingerprint));
	if (fingerprints.length === 0) return Response.json([]);

	return Response.json([
		{
			relation: [
				'delegate_permission/common.handle_all_urls',
				'delegate_permission/common.get_login_creds'
			],
			target: {
				namespace: 'android_app',
				package_name: ANDROID_PACKAGE,
				sha256_cert_fingerprints: fingerprints
			}
		}
	]);
};
