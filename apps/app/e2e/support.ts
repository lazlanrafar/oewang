import { expect, type Page } from '@playwright/test';

/**
 * What every journey needs: an account, a signed-in page, and a way to
 * name a row.
 *
 * **The suite registers its own user rather than using the seed's.** The
 * seeded `demo@oewang.local` in `apps/api/seeds/dev.sql` carries a
 * placeholder Argon2 hash that verifies against nothing, so its documented
 * password is refused with `INVALID_CREDENTIALS`. Registering is also the
 * better fixture: each run gets an empty workspace, so a test can assert
 * "one transaction" rather than "one more than before".
 *
 * Set `E2E_EMAIL` and `E2E_PASSWORD` to use an existing account instead,
 * which is what a run against a shared environment would do.
 */
const EXISTING_EMAIL = process.env.E2E_EMAIL;
const EXISTING_PASSWORD = process.env.E2E_PASSWORD;

/** Long enough for the API's rule, which is ten characters. */
const PASSWORD = EXISTING_PASSWORD ?? 'e2e-password-1234';

export type Account = { email: string; password: string };

/** An email nothing else will have used. */
export function freshEmail(): string {
	return `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}@oewang.test`;
}

/**
 * Arrive signed in, however that has to happen.
 *
 * Registering already leaves the browser signed in, so there is no second
 * trip through the login form here: `login.spec.ts` is the journey that
 * tests that form, and doing it again in every other spec would only make
 * them slower and give a login failure three places to surface.
 */
export async function signIn(page: Page): Promise<Account> {
	if (EXISTING_EMAIL) {
		const account: Account = { email: EXISTING_EMAIL, password: PASSWORD };
		await signInWith(page, account);
		return account;
	}

	const account: Account = { email: freshEmail(), password: PASSWORD };
	await register(page, account);
	return account;
}

/** The login form, filled in and submitted. */
export async function signInWith(page: Page, account: Account): Promise<void> {
	await page.goto('/login');

	await page.getByLabel(/email/i).fill(account.email);
	await page.getByLabel('Password', { exact: true }).fill(account.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();

	// The guard redirects a signed-in visitor away from /login, so landing
	// anywhere else is the signal, rather than a fixed destination.
	await expect(page).not.toHaveURL(/\/login/);
}

/**
 * One account and its workspace, through the real forms. Leaves it signed
 * in. Signing up makes no workspace (D109): the check page sends a new
 * account to create one.
 */
export async function register(page: Page, account: Account): Promise<void> {
	await page.goto('/register');

	await page.getByLabel(/email/i).fill(account.email);
	await page.getByLabel('Password', { exact: true }).fill(account.password);
	await page.getByRole('button', { name: /create account/i }).click();

	await expect(page).toHaveURL(/\/workspace-create/);
	await page.locator('#workspace-name').fill('E2E Workspace');
	await page.getByRole('button', { name: /create workspace/i }).click();

	await expect(page).toHaveURL(/\/overview/);
}

/**
 * Sign out through the shell's own account menu (D94).
 *
 * A form POST, not a link: signing out is a state change, and a GET that
 * mutates is a GET a prefetcher can fire. `page.goto('/logout')` is
 * therefore not a way to sign out, which is the point.
 *
 * The menu opens only once the shell has hydrated, so opening it is
 * retried until its item shows.
 */
export async function signOut(page: Page): Promise<void> {
	const logOut = page.getByRole('menuitem', { name: 'Log out' });
	await actUntil(
		() => page.getByRole('button', { name: 'Account menu' }).click(),
		() => expect(logOut).toBeVisible({ timeout: 1000 })
	);
	await logOut.click();
	await expect(page).toHaveURL(/\/login/);
}

/**
 * Do something, and keep doing it until it has an effect.
 *
 * Every page here is server rendered and then hydrated, so a control is
 * visible and clickable, and a key is pressable, for a moment before any
 * handler exists. An action in that window is swallowed silently, which
 * makes for a test that passes on a warm machine and fails in CI.
 *
 * Waiting on a hydration marker would mean depending on a SvelteKit
 * internal. Retrying until the effect appears depends on nothing, and the
 * effect is what the test cares about anyway.
 *
 * Only safe for an action that is harmless to repeat. Opening a panel and
 * pressing Escape both are; submitting a form is not.
 */
export async function actUntil(
	act: () => Promise<void>,
	effect: () => Promise<void>
): Promise<void> {
	await expect(async () => {
		await act();
		await effect();
	}).toPass({ timeout: 15_000, intervals: [250, 500, 1000] });
}

/**
 * Open a conversation, creating one if the workspace has none.
 *
 * `/chat` redirects to the newest conversation and shows an empty state
 * when there is none, which is what a freshly registered workspace has.
 * The button is a real form submit, so it works before hydration.
 *
 * Returns the conversation's URL, which is what the canvas tests append
 * their parameters to.
 */
export async function openConversation(page: Page): Promise<string> {
	await page.goto('/chat');

	if (!/\/chat\/.+/.test(page.url())) {
		// The sidebar's button submits a hidden form through a callback, so
		// it needs hydration; the empty state's is a plain submit and does
		// not. Retrying covers whichever one is on screen.
		await actUntil(
			() => page.getByRole('button', { name: 'New chat' }).first().click(),
			() => expect(page).toHaveURL(/\/chat\/.+/, { timeout: 2000 })
		);
	}

	await expect(page.getByLabel('Message')).toBeVisible();
	return page.url();
}

/**
 * A name no other run will have used.
 *
 * The seed holds roughly 200 transactions and a developer's workspace
 * holds more, so "Lunch" is not something a test can look for. Every row a
 * test creates is tagged, which is also what makes the suite safe to run
 * twice.
 */
export function uniqueName(prefix: string): string {
	return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
