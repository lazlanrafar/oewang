import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { actUntil, signIn } from './support';

/**
 * An .xlsx through the import wizard (US-022, D111): the server reads it,
 * and the steps after the first are the CSV path's.
 *
 * The fixture is a minimal workbook written by hand (zip + XML): a date
 * cell stored as a serial with a date format, text, and a decimal number
 * cell, which is the case that must keep its exact digits.
 */
const FIXTURE = fileURLToPath(new URL('./fixtures/statement.xlsx', import.meta.url));

test('an xlsx statement imports with its dates and exact amounts', async ({ page }) => {
	test.slow();
	await signIn(page);
	await page.goto('/transactions/import');
	// The dev server may reload once after the first load; let it settle.
	await page.waitForLoadState('networkidle');

	// A file chosen before hydration has no handler to read it: choose again
	// until the server has read it and the wizard moves to the columns step.
	const next = page.getByRole('button', { name: 'Next', exact: true });
	await actUntil(
		async () => {
			// Cleared first: the same file chosen twice fires no change.
			await page.locator('#import-file').setInputFiles([]);
			await page.locator('#import-file').setInputFiles(FIXTURE);
		},
		() => expect(page).toHaveURL(/step=columns/, { timeout: 5000 })
	);
	await page.screenshot({ path: 'test-results/import-xlsx-1.png', fullPage: true });

	await expect(page.getByText('statement.xlsx: 2 row(s) read.')).toBeVisible();

	// Mapped by hand: the assistant's proposal is optional, and this is the
	// path that must always work (US-022).
	for (const [field, column] of [
		['date', 'Date'],
		['name', 'Description'],
		['amount', 'Amount']
	]) {
		await page.locator(`#map-${field}`).click();
		await page.getByRole('option', { name: column, exact: true }).last().click();
		await expect(page.getByRole('listbox')).toHaveCount(0);
	}

	const commit = page.getByRole('button', { name: /^Import \d+ row/ });
	for (let step = 0; step < 4 && !(await commit.isVisible()); step++) {
		await next.click();
		await page.waitForTimeout(500);
	}
	await page.screenshot({ path: 'test-results/import-xlsx-2.png', fullPage: true });
	await expect(commit).toHaveText('Import 2 row(s)');
	await commit.click();
	await expect(page.getByText('Created').first()).toBeVisible({ timeout: 30_000 });
	await page.screenshot({ path: 'test-results/import-xlsx-3.png', fullPage: true });

	await page.goto('/transactions?search=XLSX');
	const warung = page.getByRole('row', { name: /WARUNG XLSX/ });
	await expect(warung).toBeVisible();
	// IDR shows no decimals; the stored 87500.5 keeps them, which the Rust
	// spreadsheet tests assert. A positive signed amount is income.
	await expect(warung).toContainText('+IDR 87.501');
	await expect(warung).toContainText('02/11/2026');
});
