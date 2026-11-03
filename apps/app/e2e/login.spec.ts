import { expect, test } from '@playwright/test';

import { freshEmail, register, signIn, signOut } from './support';

/**
 * Journey one: sign in (US-038, AUTH-1).
 *
 * The session is a cookie this app sets and the browser never reads
 * (AUTH-3, D5), so what is asserted is what a user can see: the guard
 * stops letting them in, and then stops stopping them.
 */
test.describe('signing in', () => {
	test('sends a signed-out visitor to the login form and back again', async ({ page }) => {
		const account = { email: freshEmail(), password: 'e2e-password-1234' };

		// Registering leaves the browser signed in, so the journey starts
		// by leaving: the sign-out button is a form POST, and a GET to
		// /logout would not do it.
		await register(page, account);
		await signOut(page);

		await page.goto('/transactions');

		// The guard carries where they were going, so signing in lands them
		// there rather than on the dashboard root.
		await expect(page).toHaveURL(/\/login\?next=%2Ftransactions/);

		// Filled in place rather than through the helper, because the
		// helper navigates to a bare /login and the `next` this test is
		// about would be lost on the way.
		await page.getByLabel(/email/i).fill(account.email);
		await page.getByLabel(/password/i).fill(account.password);
		await page.getByRole('button', { name: /sign in/i }).click();

		await expect(page).toHaveURL(/\/transactions/);
		await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
	});

	test('refuses the wrong password without saying which half was wrong', async ({ page }) => {
		await page.goto('/login');

		await page.getByLabel(/email/i).fill('nobody@oewang.test');
		await page.getByLabel(/password/i).fill('not-the-password');
		await page.getByRole('button', { name: /sign in/i }).click();

		await expect(page).toHaveURL(/\/login/);
		// One message for both halves: naming the wrong one tells an
		// attacker which addresses are registered.
		await expect(page.getByText('That email and password do not match.')).toBeVisible();
	});

	test('keeps the session across a reload', async ({ page }) => {
		await signIn(page);
		await page.goto('/transactions');
		await page.reload();

		await expect(page).toHaveURL(/\/transactions/);
		await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
	});

	test('answers the health check without a session', async ({ request }) => {
		// The container health check runs before anyone has signed in.
		const response = await request.get('/health');

		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
	});
});
