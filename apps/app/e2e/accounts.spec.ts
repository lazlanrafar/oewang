import { expect, test } from '@playwright/test';

import { actUntil, signIn } from './support';

/**
 * The accounts screen (US-013b): the groups sheet, reordering a wallet
 * with the keyboard, and the page at phone width (UI-6).
 *
 * The keyboard path stands in for the drag: both go through the same
 * `place` and `report` in the data table, and a pointer drag under
 * Playwright measures the test runner more than the page.
 */

async function addAccount(page: import('@playwright/test').Page, name: string) {
	await actUntil(
		() => page.getByRole('button', { name: 'Add account' }).first().click(),
		() => expect(page.locator('#account-name')).toBeVisible({ timeout: 1000 })
	);
	await page.locator('#account-name').fill(name);
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
}

const names = (page: import('@playwright/test').Page) =>
	page.getByRole('row').locator('[role="cell"]:first-child').allInnerTexts();

test('a wallet moves with the arrow keys and keeps its place', async ({ page }) => {
	await signIn(page);
	await page.goto('/accounts');
	await addAccount(page, 'Alpha E2E');
	await addAccount(page, 'Beta E2E');

	const before = (await names(page)).map((n) => n.trim()).filter(Boolean);
	const beta = before.indexOf('Beta E2E');
	expect(beta).toBeGreaterThan(0);

	await page.getByRole('button', { name: 'Reorder Beta E2E' }).focus();
	await page.keyboard.press('ArrowUp');
	await expect(page.getByText('Order saved')).toBeVisible();

	await page.reload();
	const after = (await names(page)).map((n) => n.trim()).filter(Boolean);
	expect(after.indexOf('Beta E2E')).toBe(beta - 1);
});

test('a group is added, renamed and deleted from the groups sheet', async ({ page }) => {
	await signIn(page);
	await page.goto('/accounts');

	const sheet = page.getByRole('dialog', { name: 'Account groups' });
	await actUntil(
		() => page.getByRole('button', { name: 'Manage groups' }).click(),
		() => expect(sheet).toBeVisible({ timeout: 1000 })
	);

	await sheet.getByRole('button', { name: 'New group' }).click();
	await page.locator('#group-name').fill('Group E2E');
	await page.locator('#group-name').press('Enter');
	await expect(sheet.getByText('Group E2E', { exact: true })).toBeVisible();

	await sheet.getByRole('row', { name: /Group E2E/ }).getByRole('button', { name: 'Edit' }).click();
	await page.locator('#group-name').fill('Renamed E2E');
	await page.locator('#group-name').press('Enter');
	await expect(sheet.getByText('Renamed E2E', { exact: true })).toBeVisible();

	await sheet
		.getByRole('row', { name: /Renamed E2E/ })
		.getByRole('button', { name: 'Delete group' })
		.click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
	await expect(sheet.getByText('Renamed E2E', { exact: true })).toHaveCount(0);
});

test.describe('at phone width', () => {
	test.use({ viewport: { width: 375, height: 800 } });

	test('the cards stack and only the table scrolls sideways', async ({ page }) => {
		await signIn(page);
		await page.goto('/accounts');

		// The three figures, by their labels, each on its own row.
		const labels = ['Total balance', 'Accounts', 'Counted in totals'];
		const tops = await Promise.all(
			labels.map(async (label) =>
				Math.round(
					(await page.locator('main').getByText(label, { exact: true }).first().boundingBox())?.y ?? -1
				)
			)
		);
		expect(new Set(tops).size).toBe(3);
		expect(tops.every((top) => top >= 0)).toBe(true);

		// Every header control is on screen, not cut off at the right edge.
		for (const name of ['Manage groups', 'Add account']) {
			const box = await page.getByRole('button', { name }).first().boundingBox();
			expect(box && box.x + box.width).toBeLessThanOrEqual(375);
		}

		const pageOverflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(pageOverflow).toBeLessThanOrEqual(0);

		const table = page.getByRole('table', { name: /accounts/i });
		await expect(table).toBeVisible();
		await page.screenshot({ path: 'test-results/accounts-375.png', fullPage: true });
	});
});
