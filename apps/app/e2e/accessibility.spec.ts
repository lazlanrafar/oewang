import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { openConversation, signIn } from './support';

/**
 * The axe pass on the three main screens (US-038, UI-6, UI-7).
 *
 * Accessibility is part of done rather than a pass at the end, so this
 * runs with the journeys rather than beside them
 * ([best practices](../docs/best-practices/svelte-app.md#accessibility)).
 *
 * **Two rules are disabled, both recorded rather than hidden.** The port
 * reproduces the live app's visual decisions, and two of them fail WCAG
 * today (D66, UI-7):
 *
 * - `color-contrast`: income sits at 2.30:1 and expenses at 3.91:1
 *   against a 4.5:1 requirement. Colour is never the only carrier, so the
 *   information is still available, but the contrast is still wrong.
 * - `focus-order-semantics` is not disabled; the missing focus ring is a
 *   CSS fact axe cannot see, so it is recorded in UI-7 and checked by
 *   hand rather than asserted here. Naming it here anyway, because a
 *   reader of this file would otherwise assume axe covers it.
 *
 * Anything else is a failure. The allowlist is two named rules with two
 * decisions behind them, not a threshold.
 */
const ACCEPTED_FAILURES = ['color-contrast'];

async function scan(page: Page) {
	return new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.disableRules(ACCEPTED_FAILURES)
		.analyze();
}

/** What failed, short enough to read in a CI log. */
function summarize(violations: Awaited<ReturnType<typeof scan>>['violations']): string {
	return violations
		.map((violation) => `${violation.id} (${violation.nodes.length}): ${violation.help}`)
		.join('\n');
}

test.describe('accessibility', () => {
	test('the transactions list', async ({ page }) => {
		await signIn(page);
		await page.goto('/transactions');
		await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();

		const { violations } = await scan(page);
		expect(summarize(violations)).toBe('');
	});

	test('the transaction form sheet', async ({ page }) => {
		// Opened as well as closed: a sheet is where the labels, the focus
		// trap and the dialog semantics live, and the list page shows none
		// of them.
		await signIn(page);
		await page.goto('/transactions?sheet=new');
		await expect(page.getByRole('dialog')).toBeVisible();

		const { violations } = await scan(page);
		expect(summarize(violations)).toBe('');
	});

	test('the conversation', async ({ page }) => {
		await signIn(page);
		await openConversation(page);

		const { violations } = await scan(page);
		expect(summarize(violations)).toBe('');
	});

	test('the conversation with the canvas open', async ({ page }) => {
		// US-034's panel: a labelled region, with focus moved into it.
		await signIn(page);
		const conversation = await openConversation(page);
		await page.goto(`${conversation}?canvas=receipt&id=notafile`);
		await expect(page.getByRole('heading', { name: 'Check this receipt' })).toBeVisible();

		const { violations } = await scan(page);
		expect(summarize(violations)).toBe('');
	});

	test('the settings page', async ({ page }) => {
		await signIn(page);
		// `/settings` opens its first section, as the old app's did (D82).
		await page.goto('/settings');
		await expect(page).toHaveURL(/\/settings\/income-category/);
		await expect(page.getByRole('heading', { name: 'Income categories', level: 1 })).toBeVisible();

		const { violations } = await scan(page);
		expect(summarize(violations)).toBe('');
	});

	test('the login form, which a signed-out visitor meets first', async ({ page }) => {
		await page.goto('/login');

		const { violations } = await scan(page);
		expect(summarize(violations)).toBe('');
	});
});
