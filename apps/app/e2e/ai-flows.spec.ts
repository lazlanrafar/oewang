import {
	expect,
	test,
	type Browser,
	type FileChooser,
	type Locator,
	type Page
} from '@playwright/test';

import { actUntil, openConversation, signIn } from './support';

/**
 * The AI journeys that need a real model: receipt confirmation (US-034),
 * statement import (US-035), the chat at phone width (US-046), usage
 * figures (US-050) and time to first token (US-028).
 *
 * Every fixture is made here, in a browser, so there is no binary in the
 * repo and the model reads something a person could: a receipt drawn on a
 * page and screenshotted, a statement printed to a PDF with a text layer.
 * Every test signs up a fresh workspace, so "one row" and "no usage yet"
 * are things that can be asserted.
 */

const SHOT = (name: string) => `test-results/ai-${name}.png`;
const AI = 90_000;

/** The same switch as chat.spec.ts: `E2E_CHAT=0` where no model is reachable. */
const NO_MODEL = process.env.E2E_CHAT === '0';
const needsModel = () =>
	test.skip(NO_MODEL, 'E2E_CHAT=0: no model is reachable in this environment');

/** A receipt a model can read: a shop, two lines, a total, in rupiah. */
async function receiptPng(browser: Browser, shop: string): Promise<Buffer> {
	const page = await browser.newPage({ viewport: { width: 420, height: 560 } });
	await page.setContent(`
		<body style="margin:0;background:#fff;font:20px/1.5 'Courier New',monospace;color:#000">
		<div style="width:360px;padding:28px">
			<div style="text-align:center;font-size:26px;font-weight:bold">${shop}</div>
			<div style="text-align:center">Jl. Sunset Road 8, Bali</div>
			<div style="text-align:center">2026-11-20 12:41</div>
			<hr style="border:0;border-top:2px dashed #000">
			<div style="display:flex;justify-content:space-between"><span>1 Es Kopi Susu</span><span>25.000</span></div>
			<div style="display:flex;justify-content:space-between"><span>1 Roti Bakar</span><span>18.000</span></div>
			<hr style="border:0;border-top:2px dashed #000">
			<div style="display:flex;justify-content:space-between;font-weight:bold"><span>TOTAL</span><span>Rp 43.000</span></div>
			<div style="text-align:center;margin-top:16px">TERIMA KASIH</div>
		</div></body>`);
	const png = await page.screenshot({ fullPage: true });
	await page.close();
	return png;
}

/** A statement whose text layer the deterministic parser reads (D42). */
async function statementPdf(browser: Browser, tag: string): Promise<Buffer> {
	const page = await browser.newPage();
	const rows = [
		['2026-11-02', `WARUNG ${tag}`, '87500'],
		['2026-11-05', `GOJEK ${tag}`, '32000'],
		['2026-11-09', `INDOMARET ${tag}`, '154000']
	];
	await page.setContent(`
		<body style="font:14px Arial,sans-serif">
		<h1 style="font-size:18px">BANK E2E ACCOUNT STATEMENT IDR</h1>
		<table style="border-collapse:collapse">
			${rows.map((r) => `<tr><td style="padding:4px 16px 4px 0">${r[0]}</td><td style="padding:4px 16px 4px 0">${r[1]}</td><td>${r[2]}</td></tr>`).join('')}
		</table></body>`);
	const pdf = await page.pdf({ format: 'A4' });
	await page.close();
	return pdf;
}

/** Drop a file on a dropzone, the way a person dragging it would. */
async function dropFile(target: Locator, name: string, mimeType: string, buffer: Buffer) {
	const dataTransfer = await target.page().evaluateHandle(
		({ b64, name, mimeType }) => {
			const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
			const transfer = new DataTransfer();
			transfer.items.add(new File([bytes], name, { type: mimeType }));
			return transfer;
		},
		{ b64: buffer.toString('base64'), name, mimeType }
	);
	await target.dispatchEvent('drop', { dataTransfer });
}

/** One chat turn, waited out: Stop while it runs, Send once it is over. */
async function chatTurn(page: Page, message: string) {
	await page.getByLabel('Message').fill(message);
	await page.getByRole('button', { name: 'Send' }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({
		timeout: 30_000
	});
	await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({
		timeout: AI
	});
}

/** The by-feature row's call count on /settings/usage, or 0 when absent. */
async function usageCalls(page: Page, feature: string): Promise<number> {
	await page.goto('/settings/usage');
	await expect(page.getByRole('heading', { name: 'Usage' }).first()).toBeVisible();
	const row = page.getByRole('row').filter({ hasText: feature });
	if ((await row.count()) === 0) return 0;
	return Number((await row.getByRole('cell').nth(1).innerText()).replace(/\D/g, ''));
}

test.describe('AI flows', () => {
	test('US-034: a receipt uploaded in chat is read, confirmed and saved with its items', async ({
		page,
		browser
	}) => {
		test.slow();
		needsModel();
		const shop = `KOPI E2E ${Date.now().toString(36).toUpperCase()}`;

		await signIn(page);
		await openConversation(page);

		// The composer's own "Add attachments" button and the real file
		// chooser, retried until hydration has attached the handler.
		const png = await receiptPng(browser, shop);
		let chooser: FileChooser | undefined;
		await actUntil(
			async () => {
				const waiting = page.waitForEvent('filechooser', { timeout: 1000 });
				await page.getByRole('button', { name: 'Add attachments' }).click();
				chooser = await waiting;
			},
			async () => expect(chooser).toBeDefined()
		);
		await chooser!.setFiles({
			name: 'receipt.png',
			mimeType: 'image/png',
			buffer: png
		});

		await expect(page).toHaveURL(/canvas=receipt&id=/, { timeout: 30_000 });
		const panel = page.getByRole('complementary', {
			name: 'Check this receipt'
		});
		await expect(panel).toBeVisible();
		// Beside, not over: the conversation keeps its composer.
		await expect(page.getByLabel('Message')).toBeVisible();

		const merchant = panel.locator('#receipt-merchant');
		await expect(merchant).toBeVisible({ timeout: AI });
		await page.screenshot({ path: SHOT('receipt-parsed'), fullPage: true });

		await expect(merchant).toHaveValue(/kopi/i);
		await expect(panel.locator('#receipt-total')).toHaveValue(/43[.,]?000/);
		await expect(panel.getByLabel('Line 1 description')).not.toHaveValue('');
		await expect(panel.getByLabel('Line 2 description')).not.toHaveValue('');
		// Every field is editable: correct the merchant to a known name.
		await merchant.fill(shop);

		await panel.getByRole('button', { name: 'Create transaction' }).click();
		await expect(page).not.toHaveURL(/canvas=/, { timeout: 30_000 });

		await page.goto('/transactions');
		const row = page.getByRole('row').filter({ hasText: shop });
		await expect(row).toHaveCount(1);
		await expect(row).toContainText('43.000');

		// Items and the receipt went with it: open the detail sheet.
		await actUntil(
			() => row.click(),
			() => expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 })
		);
		const detail = page.getByRole('dialog');
		await expect(detail).toContainText(/kopi susu/i);
		await expect(detail).toContainText(/roti/i);
		await expect(detail).toContainText('receipt.png');
		await page.screenshot({ path: SHOT('receipt-detail'), fullPage: true });
	});

	test('US-034 + US-050: a receipt from the transactions page, cancelled; receipt and chat move usage', async ({
		page,
		browser
	}) => {
		test.slow();
		needsModel();
		await signIn(page);

		expect(await usageCalls(page, 'Receipt scan')).toBe(0);
		expect(await usageCalls(page, 'Chat')).toBe(0);
		await expect(page.getByText('No AI calls recorded yet.')).toBeVisible();

		// The page's own way in: Backup menu, "Scan a receipt", the dropzone.
		await page.goto('/transactions');
		const scan = page.getByRole('menuitem', { name: 'Scan a receipt' });
		await actUntil(
			() => page.getByRole('button', { name: /backup/i }).click(),
			() => expect(scan).toBeVisible({ timeout: 1000 })
		);
		await scan.click();
		const dialog = page.getByRole('dialog');
		await dropFile(
			dialog.getByRole('button', { name: /click to browse/i }),
			'receipt-cancel.png',
			'image/png',
			await receiptPng(browser, 'TOKO CANCEL E2E')
		);

		await expect(page).toHaveURL(/canvas=receipt&id=/, { timeout: 30_000 });
		const panel = page.getByRole('complementary', {
			name: 'Check this receipt'
		});
		await expect(panel.locator('#receipt-merchant')).toBeVisible({
			timeout: AI
		});
		await page.screenshot({
			path: SHOT('receipt-transactions-page'),
			fullPage: true
		});

		// Cancelling creates nothing and leaves the file in the vault (AI-2).
		await panel.getByRole('button', { name: 'Cancel' }).click();
		await expect(page).not.toHaveURL(/canvas=/);
		await page.reload();
		await expect(page.getByRole('row').filter({ hasText: /cancel e2e/i })).toHaveCount(0);
		await page.goto('/vault');
		await expect(page.getByText('receipt-cancel.png').first()).toBeVisible();

		// The parse is on the usage page.
		expect(await usageCalls(page, 'Receipt scan')).toBeGreaterThanOrEqual(1);
		const totalAfterReceipt = await page
			.getByText(/\d[\d,]* in · [\d,]+ out/)
			.last()
			.innerText();
		await page.screenshot({
			path: SHOT('usage-after-receipt'),
			fullPage: true
		});

		// And so is a chat turn.
		await openConversation(page);
		await chatTurn(page, 'Reply with the single word: ready');
		expect(await usageCalls(page, 'Chat')).toBeGreaterThanOrEqual(1);
		await expect(page.getByText(/\d[\d,]* in · [\d,]+ out/).last()).not.toHaveText(
			totalAfterReceipt
		);
		await page.screenshot({ path: SHOT('usage-after-chat'), fullPage: true });
	});

	test('US-035: a statement PDF imports its rows, and the same file again imports none', async ({
		page,
		browser
	}) => {
		test.slow();
		test.setTimeout(5 * 60_000);
		const tag = Date.now().toString(36).toUpperCase();
		const pdf = await statementPdf(browser, tag);
		await signIn(page);

		async function importOnce(round: string) {
			await page.goto('/transactions/import');
			const dialog = page.getByRole('dialog');
			await actUntil(
				() => page.getByRole('button', { name: 'Import a statement image or PDF' }).click(),
				() => expect(dialog).toBeVisible({ timeout: 1000 })
			);
			await dropFile(
				dialog.getByRole('button', { name: /click to browse/i }),
				`statement-${round}.pdf`,
				'application/pdf',
				pdf
			);
			const start = dialog.getByRole('button', { name: 'Start the import' });
			await expect(start).toBeEnabled({ timeout: 30_000 });
			await start.click();
			const done = dialog.getByText('The statement has been imported.');
			// Whichever comes first, so a refused start fails now, not at the timeout.
			await expect(done.or(dialog.getByRole('alert'))).toBeVisible({
				timeout: AI
			});
			await expect(done).toBeVisible({ timeout: 1000 });
			await page.screenshot({
				path: SHOT(`statement-${round}`),
				fullPage: true
			});

			const count = async (label: string) =>
				Number(
					await dialog.locator('dl > div').filter({ hasText: label }).locator('dd').innerText()
				);
			return {
				created: await count('Created'),
				duplicates: await count('Already there'),
				skipped: await count('Skipped'),
				dialog
			};
		}

		const first = await importOnce('first');
		expect(first).toMatchObject({ created: 3, duplicates: 0, skipped: 0 });
		await expect(first.dialog.getByText(`WARUNG ${tag}`)).toBeVisible();

		const second = await importOnce('second');
		expect(second).toMatchObject({ created: 0, duplicates: 3, skipped: 0 });

		await page.goto('/transactions');
		await expect(page.getByRole('row').filter({ hasText: tag })).toHaveCount(3);
	});

	test('US-046: the chat at phone width (375 x 800)', async ({ page }) => {
		test.slow();
		await page.setViewportSize({ width: 375, height: 800 });
		await signIn(page);
		const conversation = await openConversation(page);

		await expect(page.getByRole('link', { name: 'Back to the overview' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'New chat' }).first()).toBeVisible();
		await expect(page.getByRole('button', { name: 'Conversation history' })).toBeVisible();
		await page.screenshot({ path: SHOT('phone-empty') });

		await chatTurn(page, 'In two short sentences, what can you help me with?');
		await page.screenshot({ path: SHOT('phone-answered') });

		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow, 'no horizontal scroll at 375 px').toBeLessThanOrEqual(0);

		const composer = await page.getByLabel('Message').boundingBox();
		expect(composer).not.toBeNull();
		expect(composer!.x).toBeGreaterThanOrEqual(0);
		expect(composer!.x + composer!.width).toBeLessThanOrEqual(375);
		expect(composer!.y + composer!.height).toBeLessThanOrEqual(800);

		// History behind the composer's button.
		await actUntil(
			() => page.getByRole('button', { name: 'Conversation history' }).click(),
			() =>
				expect(page.getByRole('button', { name: 'Conversation history' })).toHaveAttribute(
					'aria-expanded',
					'true',
					{ timeout: 1000 }
				)
		);
		await page.screenshot({ path: SHOT('phone-history') });
		await page.keyboard.press('Escape');

		// The canvas takes the full width below the medium breakpoint.
		await page.goto(`${conversation}?canvas=receipt&id=notafile`);
		const panel = page.getByRole('complementary', {
			name: 'Check this receipt'
		});
		await expect(panel).toBeVisible();
		await page.waitForTimeout(400); // the slide-in transition
		const box = await panel.boundingBox();
		expect(box!.width).toBeGreaterThanOrEqual(370);
		expect(box!.x).toBeLessThanOrEqual(1);
		await page.screenshot({ path: SHOT('phone-canvas') });
	});

	test('US-028: time to first token, five turns', async ({ page }) => {
		test.slow();
		test.setTimeout(8 * 60_000);
		needsModel();
		await signIn(page);
		await openConversation(page);

		const prompts = [
			'Say hello in one short sentence.',
			'Name one colour.',
			'Give me a one-line tip for saving money.',
			'What is two words for thank you in Indonesian?',
			'Reply with a short friendly sign-off.'
		];
		const values: number[] = [];

		for (const prompt of prompts) {
			await page.getByLabel('Message').fill(prompt);
			await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();

			// Observer armed, clock started and send pressed in one task, so
			// nothing between the press and the first token goes unmeasured.
			await page.evaluate(() => {
				const w = window as unknown as { __ttft: number | null };
				w.__ttft = null;
				const list = document.querySelector('ol.flex-col');
				const before = list ? list.children.length : 0;
				const assistantText = () => {
					const items = [...(document.querySelector('ol.flex-col')?.children ?? [])].slice(before);
					return items.some(
						(li) =>
							!li.classList.contains('justify-end') &&
							[...li.querySelectorAll('p.text-body, .markdown')].some(
								(el) => (el.textContent ?? '').trim() !== ''
							)
					);
				};
				const t0 = performance.now();
				const observer = new MutationObserver(() => {
					if (w.__ttft === null && assistantText()) {
						w.__ttft = performance.now() - t0;
						observer.disconnect();
					}
				});
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					characterData: true
				});
				(
					[...document.querySelectorAll('button')].find((b) =>
						[b.textContent?.trim(), b.getAttribute('aria-label'), b.getAttribute('title')].includes(
							'Send'
						)
					) as HTMLButtonElement
				).click();
			});

			const ttft = await page.waitForFunction(
				() => (window as unknown as { __ttft: number | null }).__ttft,
				null,
				{ timeout: AI }
			);
			values.push(Math.round((await ttft.jsonValue()) as number));
			await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({
				timeout: AI
			});
		}

		const sorted = [...values].sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)];
		const line = `TTFT ms: ${values.join(', ')}; median ${median} (target < 2000)`;
		console.log(line);
		test.info().annotations.push({ type: 'ttft', description: line });
		await page.screenshot({ path: SHOT('ttft-conversation'), fullPage: true });
	});
});
