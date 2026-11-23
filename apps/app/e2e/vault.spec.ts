import { expect, test, type Page } from '@playwright/test';

import { actUntil, signIn, uniqueName } from './support';

/**
 * The vault page, its file sheet (US-048) and attachment tiles with the
 * picker on a transaction (US-049).
 *
 * Every upload goes through a synthetic drop: a `DataTransfer` built in the
 * page and dispatched on the vault page, which is the "drop anywhere"
 * path the story names. The files are made in the browser, a red PNG from
 * a canvas and a one-page PDF from a string, so the suite carries no
 * binary fixtures.
 */

// The dev server compiles the vault and transactions routes on first visit,
// which alone can take most of the default 30 seconds.
test.describe.configure({ timeout: 120_000 });
// Other runs in this checkout clear test-results/ mid-run, which breaks a trace.
test.use({ trace: 'off' });

const SHOT = (name: string) => `test-results/vault-${name}.png`;

const PDF = [
	'%PDF-1.4',
	'1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
	'2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
	'3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
	'4 0 obj << /Length 44 >> stream',
	'BT /F1 24 Tf 20 100 Td (Hello PDF) Tj ET',
	'endstream endobj',
	'5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
	'trailer << /Root 1 0 R >>',
	'%%EOF'
].join('\n');

/** Open the vault once the page has hydrated, so a drop has a handler. */
async function openVault(page: Page): Promise<void> {
	await page.goto('/vault');
	await expect(page.getByRole('heading', { name: 'Vault', level: 1 })).toBeVisible();
	// Toggling the view needs hydration and is harmless to repeat.
	await actUntil(
		() => page.getByRole('button', { name: 'List view' }).click(),
		() => expect(page).toHaveURL(/view=list/, { timeout: 1000 })
	);
	await page.getByRole('button', { name: 'Grid view' }).click();
	await expect(page).not.toHaveURL(/view=/);
}

/** Drop one file on the vault page, as a user dragging from the desktop. */
async function dropFile(page: Page, kind: 'png' | 'pdf', name: string): Promise<void> {
	await page.getByRole('heading', { name: 'Vault', level: 1 }).evaluate(
		async (target, { kind, name, pdf }) => {
			let file: File;
			if (kind === 'png') {
				const canvas = document.createElement('canvas');
				canvas.width = 160;
				canvas.height = 90;
				const ctx = canvas.getContext('2d')!;
				ctx.fillStyle = '#d33';
				ctx.fillRect(0, 0, 160, 90);
				ctx.fillStyle = '#fff';
				ctx.fillRect(60, 25, 40, 40);
				const blob = await new Promise<Blob>((resolve) =>
					canvas.toBlob((b) => resolve(b!), 'image/png')
				);
				file = new File([blob], name, { type: 'image/png' });
			} else {
				file = new File([pdf], name, { type: 'application/pdf' });
			}
			const data = new DataTransfer();
			data.items.add(file);
			for (const type of ['dragenter', 'dragover', 'drop']) {
				target.dispatchEvent(
					new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data })
				);
			}
		},
		{ kind, name, pdf: PDF }
	);
}

/** Drop a file and wait for the sheet the page opens on a single upload. */
async function uploadByDrop(page: Page, kind: 'png' | 'pdf', name: string) {
	await dropFile(page, kind, name);
	await expect(page).toHaveURL(/[?&]file=/, { timeout: 20_000 });
	const sheet = page.getByRole('dialog');
	await expect(sheet.getByRole('heading', { name, exact: true, level: 2 })).toBeVisible();
	return { sheet, id: new URL(page.url()).searchParams.get('file')! };
}

/** One expense through the form sheet; returns its id from `?detail=`. */
async function createTransaction(page: Page, name: string): Promise<string> {
	await page.goto('/transactions');
	await actUntil(
		() => page.getByRole('button', { name: 'Add', exact: true }).click(),
		() => expect(page).toHaveURL(/sheet=new/, { timeout: 1000 })
	);
	const form = page.getByRole('dialog');
	await form.locator('#form-name').fill(name);
	await form.locator('#form-amount').fill('25000');
	await form.getByRole('button', { name: 'Create transaction' }).click();
	await expect(page).not.toHaveURL(/sheet=/);

	await actUntil(
		() => page.getByRole('row').filter({ hasText: name }).click(),
		() => expect(page).toHaveURL(/detail=/, { timeout: 1000 })
	);
	return new URL(page.url()).searchParams.get('detail')!;
}

/** Attach a vault file to the open detail sheet through the picker. */
async function attachFromPicker(page: Page, fileName: string): Promise<void> {
	const detail = page.getByRole('dialog');
	await detail.getByRole('button', { name: 'Add or upload files' }).click();
	const picker = page.getByRole('dialog', { name: 'Select file' });
	await expect(picker).toBeVisible();
	await picker.getByRole('button', { name: `Select ${fileName}` }).click();
	await picker.getByRole('button', { name: 'Done' }).click();
	await expect(picker).toBeHidden();
}

test.describe('the vault page and file sheet (US-048)', () => {
	test('uploads an image by drop, previews it, renames and tags it', async ({ page }) => {
		await signIn(page);
		await openVault(page);

		const name = `${uniqueName('receipt').replace(' ', '-')}.png`;
		const { sheet } = await uploadByDrop(page, 'png', name);
		// One toast for the batch.
		await expect(page.getByText('All files uploaded successfully')).toBeVisible();

		// The image preview: an <img> from a Blob URL that actually decoded.
		const img = sheet.locator(`img[alt="${name}"]`).first();
		await expect(img).toBeVisible();
		await expect(img).toHaveAttribute('src', /^blob:/);
		expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(160);
		await page.screenshot({ path: SHOT('image-preview') });

		// Rename: the pen button turns the name into a field.
		const renamed = uniqueName('Renamed');
		await sheet.getByRole('button', { name: 'Rename' }).click();
		await sheet.getByLabel('File name').fill(renamed);
		await sheet.getByLabel('File name').press('Enter');
		await expect(page.getByText('File renamed').first()).toBeVisible();
		await expect(sheet.getByRole('heading', { name: renamed, exact: true, level: 2 })).toBeVisible();

		// Tag: a suggested chip and a custom one.
		await sheet.getByRole('button', { name: '+ Invoice' }).click();
		await expect(sheet.getByRole('button', { name: 'Remove tag Invoice' })).toBeVisible();
		await sheet.getByLabel('Add custom tag...').fill('Q4 trip');
		await sheet.getByLabel('Add custom tag...').press('Enter');
		await expect(sheet.getByRole('button', { name: 'Remove tag Q4 trip' })).toBeVisible();
		await page.screenshot({ path: SHOT('renamed-tagged') });

		// Both survive a reload: they are on the server, not in the sheet.
		await page.reload();
		const again = page.getByRole('dialog');
		await expect(again.getByRole('heading', { name: renamed, exact: true, level: 2 })).toBeVisible();
		await expect(again.getByRole('button', { name: 'Remove tag Invoice' })).toBeVisible();
		await expect(again.getByRole('button', { name: 'Remove tag Q4 trip' })).toBeVisible();

		// The grid tile carries the new name too.
		await again.getByRole('button', { name: 'Close' }).click();
		await expect(page).not.toHaveURL(/file=/);
		await expect(page.getByText(renamed).first()).toBeVisible();
		await page.screenshot({ path: SHOT('grid') });
	});

	test('keeps the image preview after a tag change', async ({ page }) => {
		await signIn(page);
		await openVault(page);
		const name = `${uniqueName('keep').replace(' ', '-')}.png`;
		const { sheet } = await uploadByDrop(page, 'png', name);
		await expect(sheet.locator(`img[alt="${name}"]`).first()).toBeVisible();

		await sheet.getByRole('button', { name: '+ Receipt' }).click();
		await expect(sheet.getByRole('button', { name: 'Remove tag Receipt' })).toBeVisible();
		await expect(sheet.locator(`img[alt="${name}"]`).first()).toBeVisible();
		await page.screenshot({ path: SHOT('preview-after-tag') });
	});

	test('saves a rename once', async ({ page }) => {
		await signIn(page);
		await openVault(page);
		const name = `${uniqueName('once').replace(' ', '-')}.png`;
		const { sheet } = await uploadByDrop(page, 'png', name);
		await expect(sheet.locator(`img[alt="${name}"]`).first()).toBeVisible();

		const updates: string[] = [];
		page.on('request', (req) => {
			if (req.method() === 'POST' && req.url().includes('/update')) updates.push(req.url());
		});

		const renamed = uniqueName('Once');
		await sheet.getByRole('button', { name: 'Rename' }).click();
		await sheet.getByLabel('File name').fill(renamed);
		await sheet.getByLabel('File name').press('Enter');
		await expect(sheet.getByRole('heading', { name: renamed, exact: true, level: 2 })).toBeVisible();
		await page.waitForTimeout(1500);
		expect(updates, 'one Enter should save the name once').toHaveLength(1);
		await expect(page.getByText('File renamed')).toHaveCount(1);
	});

	test('previews a PDF in a frame', async ({ page }) => {
		const csp: string[] = [];
		page.on('console', (msg) => {
			if (/Content Security Policy|Refused to frame/i.test(msg.text())) csp.push(msg.text());
		});
		await signIn(page);
		await openVault(page);

		const name = `${uniqueName('statement').replace(' ', '-')}.pdf`;
		const { sheet } = await uploadByDrop(page, 'pdf', name);

		const frame = sheet.locator(`iframe[title="${name}"]`);
		await expect(frame).toBeVisible();
		await expect(frame).toHaveAttribute('src', /^blob:/);
		await expect(sheet.getByText('PDF').first()).toBeVisible();
		// SEC-15: `frame-src blob:` lets the frame load.
		expect(csp).toEqual([]);
		// Headless Chromium has no PDF viewer, so the frame paints blank here.
		await page.screenshot({ path: SHOT('pdf-preview') });
	});

	test('renders the page and the sheet in dark mode', async ({ page }) => {
		await signIn(page);
		await openVault(page);

		// The app's own control: Account menu, Theme, Dark.
		await actUntil(
			() => page.getByRole('button', { name: 'Account menu' }).click(),
			() => expect(page.getByRole('menuitem', { name: 'Theme' })).toBeVisible({ timeout: 1000 })
		);
		await page.getByRole('menuitem', { name: 'Theme' }).click();
		await page.getByRole('menuitem', { name: 'Dark' }).click();
		await expect(page.locator('html')).toHaveClass(/\bdark\b/);

		const name = `${uniqueName('dark').replace(' ', '-')}.png`;
		const { sheet } = await uploadByDrop(page, 'png', name);
		await expect(sheet.locator(`img[alt="${name}"]`).first()).toBeVisible();

		// The surfaces are dark, not just the class.
		const luminance = await sheet.evaluate((el) => {
			const [r, g, b] = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)!.map(Number);
			return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
		});
		expect(luminance).toBeLessThan(0.3);
		await page.screenshot({ path: SHOT('dark-sheet') });

		await sheet.getByRole('button', { name: 'Close' }).click();
		await expect(page).not.toHaveURL(/file=/);
		await page.screenshot({ path: SHOT('dark-grid') });
	});

	test('deletes a file behind a confirmation that counts its transactions', async ({ page }) => {
		await signIn(page);
		await openVault(page);
		const name = `${uniqueName('to-delete').replace(' ', '-')}.png`;
		const { id } = await uploadByDrop(page, 'png', name);

		const txn = uniqueName('E2E attached');
		const txnId = await createTransaction(page, txn);
		await attachFromPicker(page, name);
		await expect(page.getByText('Transaction updated').or(page.getByRole('button', { name: `Open ${name}` }))).toBeVisible();

		await page.goto(`/vault?file=${id}`);
		const sheet = page.getByRole('dialog');
		await expect(sheet.getByText(txn)).toBeVisible();
		await actUntil(
			() => sheet.getByRole('button', { name: 'Delete' }).click(),
			() => expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 1000 })
		);
		const confirm = page.getByRole('alertdialog');
		await expect(confirm).toContainText('It is attached to 1 transactions');
		await page.screenshot({ path: SHOT('delete-confirm') });
		await confirm.getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByText('File deleted')).toBeVisible();
		await expect(page).not.toHaveURL(/file=/);
		await expect(page.getByText('No files found')).toBeVisible();

		// The transaction no longer shows the tile.
		await page.goto(`/transactions?detail=${txnId}`);
		await expect(page.getByRole('dialog').getByText(txn).first()).toBeVisible();
		await expect(page.getByRole('button', { name: `Open ${name}` })).toHaveCount(0);
	});
});

test.describe('tiles and the picker on a transaction (US-049)', () => {
	test('attaches from the picker, opens the file over it, removes the tile', async ({ page }) => {
		await signIn(page);
		await openVault(page);
		const name = `${uniqueName('tile').replace(' ', '-')}.png`;
		await uploadByDrop(page, 'png', name);

		const txn = uniqueName('E2E tiled');
		const txnId = await createTransaction(page, txn);

		// Attach from the picker: the tile shows, and is saved at once.
		await attachFromPicker(page, name);
		const tile = page.getByRole('button', { name: `Open ${name}` });
		await expect(tile).toBeVisible();
		await page.screenshot({ path: SHOT('tile-attached') });
		await page.reload();
		await expect(page.getByRole('button', { name: `Open ${name}` })).toBeVisible();

		// Open the file over the transaction: `?file=` on /transactions.
		await page.getByRole('button', { name: `Open ${name}` }).click();
		await expect(page).toHaveURL(new RegExp(`/transactions\\?.*detail=${txnId}.*file=|/transactions\\?.*file=.*detail=${txnId}`));
		const fileSheet = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name, exact: true, level: 2 }) });
		await expect(fileSheet).toBeVisible();
		await expect(fileSheet.locator(`img[alt="${name}"]`).first()).toBeVisible();
		await expect(fileSheet.getByText(txn)).toBeVisible();
		await page.screenshot({ path: SHOT('file-over-transaction') });

		await fileSheet.getByRole('button', { name: 'Close' }).click();
		await expect(page).not.toHaveURL(/file=/);
		await expect(page).toHaveURL(/detail=/);

		// Remove the tile in the detail sheet; it saves at once.
		await page.getByRole('button', { name: `Remove ${name}` }).click();
		await expect(page.getByRole('button', { name: `Open ${name}` })).toHaveCount(0);
		await page.reload();
		await expect(page.getByRole('dialog').getByText(txn).first()).toBeVisible();
		await expect(page.getByRole('button', { name: `Open ${name}` })).toHaveCount(0);
		await page.screenshot({ path: SHOT('tile-removed') });
	});
});
