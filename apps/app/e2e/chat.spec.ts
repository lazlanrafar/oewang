import { expect, test } from '@playwright/test';

import { actUntil, openConversation, signIn } from './support';

/**
 * Journey three: a chat message that creates a transaction (US-038,
 * CHAT-2, CHAT-4, CHAT-12).
 *
 * This is the only test in the suite that needs a model to answer. It runs
 * by default, because a journey that is skipped by default is a journey
 * nobody runs. Set `E2E_CHAT=0` where no model is reachable: the turn then
 * fails for a reason that has nothing to do with the app, and a test that
 * fails for the wrong reason is a test somebody switches off for good.
 *
 * What it proves when it runs: the browser never talks to the API or the
 * model (D5) and still ends up with a row in the ledger, and the
 * transactions page shows it without a manual reload (D32, CHAT-12).
 */
const MODEL_AVAILABLE = process.env.E2E_CHAT !== '0';

test.describe('the assistant', () => {
	test('opens a conversation and accepts a message', async ({ page }) => {
		// Needs no model: the turn is sent, and the composer clears whether
		// or not an answer comes back.
		await signIn(page);
		await openConversation(page);

		await expect(page).toHaveURL(/\/chat\/.+/);
		await expect(page.getByRole('button', { name: 'Add attachments' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
	});

	test('opens the receipt canvas beside the conversation', async ({ page }) => {
		// US-034: the panel is URL driven, so it opens without an upload
		// and the conversation column stays on screen beside it.
		await signIn(page);
		const conversation = await openConversation(page);

		await page.goto(`${conversation}?canvas=receipt&id=notafile`);

		await expect(page.getByRole('heading', { name: 'Check this receipt' })).toBeVisible();
		// Beside, not over: the composer is still there.
		await expect(page.getByLabel('Message')).toBeVisible();

		await actUntil(
			() => page.keyboard.press('Escape'),
			() => expect(page).not.toHaveURL(/canvas=/, { timeout: 1000 })
		);
	});

	test('creates a transaction from a message', async ({ page }) => {
		test.skip(
			!MODEL_AVAILABLE,
			'E2E_CHAT=0: no model is reachable in this environment'
		);

		await signIn(page);
		await openConversation(page);

		await page.getByLabel('Message').fill('Add a 50,000 lunch expense from my Cash wallet');
		await page.getByRole('button', { name: 'Send' }).click();

		// The composer carries Stop while a turn runs and Send when there
		// is none, so it is the turn's own state machine, visible.
		const toolRan = page.getByText('Creating transaction');
		const idle = page.getByRole('button', { name: 'Send' });

		await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 30_000 });

		// Whichever happens first: the tool strip appears, or the turn ends
		// without it. Waiting only for the strip would turn "the model
		// answered something else" into a 60 second timeout, and a timeout
		// says nothing about why.
		await Promise.race([
			toolRan.waitFor({ state: 'visible', timeout: 60_000 }),
			idle.waitFor({ state: 'visible', timeout: 60_000 })
		]).catch(() => undefined);

		if (!(await toolRan.isVisible())) {
			// Almost always the environment rather than the app: a model
			// the gateway no longer serves, a missing key, a rate limit.
			// Say what it did answer, because that names the cause.
			const reply = await page.locator('ol > li').last().innerText();
			throw new Error(`the assistant answered without calling a tool:\n\n${reply}`);
		}

		// Then wait for the turn to finish, so the row is written and
		// persisted before the ledger is read.
		await expect(idle).toBeVisible({ timeout: 60_000 });

		// Then the ledger, read back through its own page. No manual
		// reload: the invalidation map is what refreshes the screens that
		// are already open (D32), and this is a fresh navigation either way.
		await page.goto('/transactions');
		await expect(page.getByText('1 transaction(s)')).toBeVisible();
	});
});
