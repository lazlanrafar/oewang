import { expect, test } from '@playwright/test';

import { actUntil, signIn, uniqueName } from './support';

/**
 * Journey two: create a transaction through the form sheet (US-038, TXN-1).
 *
 * The assertion that matters is the last one: the row is in the list the
 * server sent back, not in a list the browser patched. A create moves a
 * wallet balance, so it waits for the server rather than updating
 * optimistically, and this is where that is checked end to end.
 *
 * Each test signs in, which registers a fresh workspace, so the list
 * starts empty and "one row" is a thing that can be asserted.
 */
test.describe('creating a transaction', () => {
	test('shows a new expense in the list', async ({ page }) => {
		const name = uniqueName('E2E lunch');

		await signIn(page);
		await page.goto('/transactions');
		await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();

		// The sheet lives in `?sheet=`, so a reload would reopen it (UI-8).
		await actUntil(
			() => page.getByRole('button', { name: 'Add', exact: true }).click(),
			() => expect(page).toHaveURL(/sheet=new/, { timeout: 1000 })
		);

		const sheet = page.getByRole('dialog');
		await expect(sheet).toBeVisible();

		await sheet.locator('#form-name').fill(name);
		await sheet.locator('#form-amount').fill('50000');
		await sheet.getByRole('button', { name: 'Create transaction' }).click();

		// The sheet closes on success and the URL follows it.
		await expect(page).not.toHaveURL(/sheet=/);

		// The row came back from the server: this list is what the load
		// returned, not something the browser inserted.
		await expect(page.getByText(name).first()).toBeVisible();
		await expect(page.getByText('1 transaction(s)')).toBeVisible();
	});

	test('keeps the form sheet open across a reload', async ({ page }) => {
		// UI-8, D55: what is on screen is in the URL, including this.
		await signIn(page);
		await page.goto('/transactions?sheet=new');

		await expect(page.getByRole('dialog')).toBeVisible();
		await page.reload();
		await expect(page.getByRole('dialog')).toBeVisible();
	});

	test('reproduces a filtered view from the URL alone', async ({ page }) => {
		// TXN-9: a pasted link shows the sender what the sender saw.
		await signIn(page);
		await page.goto('/transactions?type=income&group=none');

		await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
		// The control reflects the URL rather than its own default.
		await expect(page.getByText('Income', { exact: true }).first()).toBeVisible();
	});

	test('opens the receipt canvas from the URL and closes it on Escape', async ({ page }) => {
		// US-034. The panel is driven by `?canvas=`, so it can be opened
		// without an upload; the file id is not one, so it reports that
		// rather than hanging.
		await signIn(page);
		await page.goto('/transactions?canvas=receipt&id=notafile');

		const panel = page.getByRole('heading', { name: 'Check this receipt' });
		await expect(panel).toBeVisible();

		await actUntil(
			() => page.keyboard.press('Escape'),
			() => expect(page).not.toHaveURL(/canvas=/, { timeout: 1000 })
		);
	});
});
