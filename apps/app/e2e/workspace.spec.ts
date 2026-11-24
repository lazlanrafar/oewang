import { expect, test, type Browser, type Page } from '@playwright/test';

import { actUntil, freshEmail, register, signIn, signInWith, signOut, type Account } from './support';

/**
 * The account area and the workspace settings, end to end in a browser:
 * US-052 (password, sign out everywhere), US-058 (invite, role, remove,
 * currency of an empty workspace) and US-059 (convert the currency).
 *
 * Each `signIn` registers a fresh account with its own empty workspace,
 * which is the throwaway workspace the conversion runs on.
 */

// Several accounts, sessions and screens per journey, on a shared stack.
test.describe.configure({ timeout: 120_000 });

const shot = (page: Page, name: string) =>
	page.screenshot({ path: `test-results/workspace-${name}.png`, fullPage: true });

/** A second browser, signed in as the same person: another device. */
async function secondDevice(browser: Browser, account: Account): Promise<Page> {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signInWith(page, account);
	return page;
}

/**
 * Whether this browser still holds a session the server honours.
 *
 * The access token is a JWT that lives up to 15 minutes after revocation
 * (docs/security/auth.md, known gap), so the proof is the refresh token:
 * drop the access cookie, as its expiry would, and the hook must either
 * refresh it or send the browser to sign in.
 */
async function sessionSurvives(page: Page): Promise<boolean> {
	const context = page.context();
	const kept = (await context.cookies()).filter((cookie) => cookie.name !== 'oewang-session');
	await context.clearCookies();
	await context.addCookies(kept);
	await page.goto('/overview');
	return !/\/login/.test(page.url());
}

/** Pick a value in the app's searchable select (molecules/combobox). */
async function pick(page: Page, trigger: string, value: string) {
	const search = page.locator('[data-slot="command-input"]');
	await actUntil(
		() => page.locator(trigger).click(),
		() => expect(search).toBeVisible({ timeout: 1000 })
	);
	await search.fill(value);
	await page.getByRole('option', { name: value, exact: true }).click();
}

test.describe('US-052 the account area', () => {
	test('a changed password signs in, the old one does not, and other devices are signed out', async ({
		page,
		browser
	}) => {
		const account = await signIn(page);
		const other = await secondDevice(browser, account);
		const next = `${account.password}-new`;

		await page.goto('/account/security');
		// A submit before hydration posts natively and shows no toast, so
		// wait until the page answers a harmless click (the eye toggle).
		await actUntil(
			() => page.getByRole('button', { name: 'Show password' }).first().click(),
			() => expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible({ timeout: 500 })
		);
		await page.locator('#current-password').fill(account.password);
		await page.locator('#new-password').fill(next);
		await page.getByRole('button', { name: 'Change password' }).click();
		await expect(page.getByText('Password changed. Every other session was signed out.')).toBeVisible();
		await shot(page, 'password-changed');
		// Only this browser's fresh session is left in the list.
		await page.reload();
		await expect(page.getByText(/^Signed in /)).toHaveCount(1);
		await shot(page, 'password-changed-sessions');

		// This browser was handed a fresh session and stays in.
		expect(await sessionSurvives(page)).toBe(true);
		// The other device's session was ended.
		expect(await sessionSurvives(other)).toBe(false);

		await signOut(page);
		await page.getByLabel(/email/i).fill(account.email);
		await page.getByLabel('Password', { exact: true }).fill(account.password);
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(page).toHaveURL(/\/login/);
		await shot(page, 'old-password-refused');

		await signInWith(page, { email: account.email, password: next });
	});

	test('sign out of all devices asks first, then ends this and every other session', async ({
		page,
		browser
	}) => {
		const account = await signIn(page);
		const other = await secondDevice(browser, account);

		await page.goto('/account/security');
		await expect(page.getByText('Active sessions')).toBeVisible();
		await shot(page, 'sessions');

		const confirm = page.getByRole('alertdialog');
		await actUntil(
			() => page.getByRole('button', { name: 'Sign out of all devices' }).click(),
			() => expect(confirm).toBeVisible({ timeout: 1000 })
		);
		await expect(confirm).toContainText('Sign out everywhere, this browser included?');
		await shot(page, 'logout-all-confirm');
		await confirm.getByRole('button', { name: 'Sign out of all devices' }).click();

		await expect(page).toHaveURL(/\/login/);
		await page.waitForLoadState();
		await page.goto('/overview');
		await expect(page).toHaveURL(/\/login/);

		expect(await sessionSurvives(other)).toBe(false);
		await shot(other, 'other-device-signed-out');
	});
});

test.describe('US-058 members and currency', () => {
	test('an invited account accepts, has its role changed, and is removed', async ({
		page,
		browser
	}) => {
		const owner = await signIn(page);
		const invitee: Account = { email: freshEmail(), password: owner.password };

		await page.goto('/settings/members');
		const email = page.locator('#invite-email');
		await actUntil(
			() => page.getByRole('button', { name: 'Invite member' }).click(),
			() => expect(email).toBeVisible({ timeout: 1000 })
		);
		await email.fill(invitee.email);
		await page.getByRole('button', { name: 'Send invitation' }).click();
		const link = await page.locator('#invite-link').inputValue();
		expect(link).toContain('/accept-invite?token=');
		await shot(page, 'invite-link');

		// The invited person signs up on their own device and opens the link.
		const guest = await (await browser.newContext()).newPage();
		await register(guest, invitee);
		await guest.goto(link);
		await expect(guest).toHaveURL(/\/overview/);
		await guest.goto('/settings/members');
		await expect(guest.getByText(owner.email)).toBeVisible();
		await expect(guest.getByText('Only an owner or an admin can invite people')).toBeVisible();
		await shot(guest, 'invitee-joined');

		await page.goto('/settings/members');
		const row = page.getByRole('row').filter({ hasText: invitee.email });
		await expect(row).toContainText('Member');

		// Change the role to admin through the row menu.
		await actUntil(
			() => row.getByRole('button', { name: 'Actions' }).click(),
			() => expect(page.getByRole('menuitem', { name: 'Change role' })).toBeVisible({ timeout: 1000 })
		);
		await page.getByRole('menuitem', { name: 'Change role' }).click();
		await page.getByRole('menuitemradio', { name: 'Admin' }).click();
		await expect(page.getByText('Role changed.')).toBeVisible();
		await page.reload();
		await expect(page.getByRole('row').filter({ hasText: invitee.email })).toContainText('Admin');
		await shot(page, 'role-changed');

		// The invitee sees the change: an admin is no longer read only.
		await guest.reload();
		await expect(guest.getByRole('button', { name: 'Invite member' })).toBeVisible();

		// Remove them.
		await actUntil(
			() => row.getByRole('button', { name: 'Actions' }).click(),
			() =>
				expect(page.getByRole('menuitem', { name: 'Remove from workspace' })).toBeVisible({
					timeout: 1000
				})
		);
		await page.getByRole('menuitem', { name: 'Remove from workspace' }).click();
		const confirm = page.getByRole('alertdialog');
		await expect(confirm).toContainText(invitee.email);
		await confirm.getByRole('button', { name: 'Remove from workspace' }).click();
		await expect(page.getByText('Member removed.')).toBeVisible();
		await page.reload();
		await expect(page.getByRole('row').filter({ hasText: invitee.email })).toHaveCount(0);
		await shot(page, 'member-removed');
	});

	test('a workspace with no transactions changes its currency', async ({ page }) => {
		await signIn(page);
		await page.goto('/settings/currency');
		await expect(
			page.getByText('You can change it until the first transaction is recorded.')
		).toBeVisible();

		await pick(page, '#workspace-currency', 'USD');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Currency changed.')).toBeVisible();

		await page.reload();
		await expect(page.locator('#workspace-currency')).toContainText('USD');
		await shot(page, 'currency-changed');
	});
});

test.describe('US-059 convert the workspace currency', () => {
	test('after converting, transactions, overview and budgets read in the new currency', async ({
		page
	}) => {
		await signIn(page);

		// One transaction locks the currency.
		await page.goto('/transactions');
		await actUntil(
			() => page.getByRole('button', { name: 'Add', exact: true }).click(),
			() => expect(page).toHaveURL(/sheet=new/, { timeout: 1000 })
		);
		const sheet = page.getByRole('dialog');
		await sheet.locator('#form-name').fill('Convert me');
		await sheet.locator('#form-amount').fill('50000');
		await sheet.getByRole('button', { name: 'Create transaction' }).click();
		await expect(page).not.toHaveURL(/sheet=/);
		await shot(page, 'convert-before-transactions');

		// And one budget.
		await page.goto('/budget');
		await actUntil(
			() => page.getByRole('button', { name: 'New budget' }).first().click(),
			() => expect(page.locator('#budget-amount')).toBeVisible({ timeout: 1000 })
		);
		const budgetSheet = page.getByRole('dialog');
		await page.locator('#budget-category').click();
		await page.getByRole('option').first().click();
		await page.locator('#budget-amount').fill('1000000');
		await budgetSheet.getByRole('button', { name: 'Create budget' }).click();
		await expect(page.getByText('Budget created')).toBeVisible();
		await shot(page, 'convert-before-budget');

		await page.goto('/settings/currency');
		await expect(page.getByText(/Fixed: this workspace already has transactions/)).toBeVisible();
		await pick(page, '#convert-to', 'USD');
		await expect(page).toHaveURL(/to=USD/);
		await page.locator('#convert-rate').fill('0.00006');
		await shot(page, 'convert-preview');

		const confirm = page.getByRole('alertdialog');
		await actUntil(
			() => page.getByRole('button', { name: 'Convert to USD' }).click(),
			() => expect(confirm).toBeVisible({ timeout: 1000 })
		);
		await page.locator('#convert-confirm').fill('USD');
		await shot(page, 'convert-confirm');
		await confirm.getByRole('button', { name: 'Convert to USD' }).click();
		await expect(page.getByText(/Converted to USD\. 1 transaction and 1 budget recalculated/)).toBeVisible();
		await shot(page, 'converted');

		await page.reload();
		await expect(page.locator('#workspace-currency')).toContainText('USD');
		await shot(page, 'converted-settings');

		// 50,000 IDR at 0.00006 is 3 USD; 1,000,000 IDR is 60 USD. The
		// wallet stays in IDR (each account keeps its own), so the row keeps
		// its IDR amount and the day's total reads in the workspace's USD.
		await page.goto('/overview');
		await expect(page.getByText('USD 3,00').first()).toBeVisible();
		await shot(page, 'converted-overview');

		await page.goto('/budget');
		await expect(page.getByRole('row').filter({ hasText: 'USD 60,00' })).toHaveCount(1);
		await shot(page, 'converted-budget');

		await page.goto('/transactions');
		await shot(page, 'converted-transactions');
		const txn = page.getByRole('row').filter({ hasText: 'Convert me' });
		await expect(txn).toHaveCount(1);
		await shot(page, 'converted-transactions-loaded');
		// The row is in its wallet's IDR; its workspace amount is on the detail.
		await actUntil(
			() => txn.getByText('Convert me').click(),
			() => expect(page).toHaveURL(/detail=/, { timeout: 1000 })
		);
		await expect(page.getByRole('dialog')).toContainText('USD 3,00');
		await shot(page, 'converted-transaction-detail');
	});
});
