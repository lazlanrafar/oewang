import { expect, test, type CDPSession, type Page } from '@playwright/test';

import { actUntil, signIn, signOut } from './support';

/**
 * Passkeys in a browser (US-062, AUTH-14, D110).
 *
 * Chromium's virtual WebAuthn authenticator stands in for Touch ID: a
 * platform authenticator with resident keys that always passes user
 * verification. It proves the two ceremonies run end to end through the
 * app's own routes and the API's checks; it cannot prove anything about a
 * real sensor, a synced passkey or another browser's prompt.
 */
const SHOTS = process.env.PASSKEY_SHOTS ?? 'test-results/passkey';

async function virtualAuthenticator(page: Page): Promise<{ cdp: CDPSession; id: string }> {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true
		}
	});
	return { cdp, id: authenticatorId };
}

async function credentialCount(cdp: CDPSession, authenticatorId: string): Promise<number> {
	const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
	return credentials.length;
}

async function addPasskeyInAccount(page: Page): Promise<void> {
	await page.goto('/account/security');
	await expect(page.getByText('No passkeys yet.')).toBeVisible();
	// A click before hydration does nothing; a repeat after it is refused by
	// excludeCredentials, so retrying cannot make a second passkey.
	await actUntil(
		() => page.getByRole('button', { name: 'Add a passkey' }).click(),
		() => expect(page.getByRole('button', { name: /^Remove / })).toBeVisible({ timeout: 5000 })
	);
	await expect(page.getByText('Passkey added. Use it next time you sign in.')).toBeVisible();
}

async function passkeySignIn(page: Page): Promise<void> {
	await page.goto('/login');
	await actUntil(
		() => page.getByRole('button', { name: 'Sign in with a passkey' }).click(),
		// Either outcome shows the click landed: a new page, or a refusal.
		() =>
			expect(page.getByRole('alert').or(page.getByText('Overview').first())).toBeVisible({
				timeout: 5000
			})
	);
}

test.describe('passkeys', () => {
	test('one added in Account signs in with no password, once only', async ({ page }) => {
		const { cdp, id } = await virtualAuthenticator(page);

		await signIn(page);
		await addPasskeyInAccount(page);
		expect(await credentialCount(cdp, id)).toBe(1);
		await expect(page.getByText('Not used yet')).toBeVisible();
		await page.screenshot({ path: `${SHOTS}/1-added.png`, fullPage: true });

		// The same device is refused a second one (excludeCredentials).
		await page.getByRole('button', { name: 'Add a passkey' }).click();
		await expect(page.getByText('The passkey was not added. Try again.')).toBeVisible();
		await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(1);
		expect(await credentialCount(cdp, id)).toBe(1);

		await page.goto('/overview');
		await signOut(page);

		await passkeySignIn(page);
		await expect(page).toHaveURL(/\/overview/);
		await page.screenshot({ path: `${SHOTS}/2-signed-in.png`, fullPage: true });

		await page.goto('/account/security');
		await expect(page.getByText(/Last used /)).toBeVisible();
		await page.screenshot({ path: `${SHOTS}/3-last-used.png`, fullPage: true });
	});

	test('a removed passkey no longer signs in', async ({ page }) => {
		const { cdp, id } = await virtualAuthenticator(page);

		await signIn(page);
		await addPasskeyInAccount(page);

		await page.getByRole('button', { name: /^Remove / }).click();
		await page.getByRole('button', { name: 'Remove', exact: true }).click();
		await expect(page.getByText('No passkeys yet.')).toBeVisible();
		// The copy on the device stays; only the server stops accepting it.
		expect(await credentialCount(cdp, id)).toBe(1);

		await page.goto('/overview');
		await signOut(page);

		await passkeySignIn(page);
		await expect(page.getByRole('alert')).toHaveText(
			'That passkey did not sign you in. Try again, or use your password.'
		);
		await expect(page).toHaveURL(/\/login/);
		await page.screenshot({ path: `${SHOTS}/4-removed-refused.png`, fullPage: true });
	});
});
