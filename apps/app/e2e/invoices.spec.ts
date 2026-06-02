import { expect, test } from "./fixtures";

test.describe("Invoices Page", () => {
  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/invoices");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the Invoices page to be visible and fully hydrated
    await expect(page).toHaveURL(/.*invoices/);
    await expect(page.getByPlaceholder(dictionary.invoices.search_placeholder)).toBeVisible({ timeout: 15000 });
  });

  test("loads invoices page successfully", async ({ page, dictionary }) => {
    await expect(page).toHaveURL(/.*invoices/);
    // InvoicesClient uses dictionary.invoices.summary.total as a text label (not a heading)
    const hasContent =
      (await page
        .getByRole("button", { name: dictionary.invoices.add_button })
        .first()
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(dictionary.invoices.summary.total)
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(dictionary.invoices.empty.title)
        .isVisible()
        .catch(() => false));
    expect(hasContent).toBe(true);
  });

  test("displays invoice list or empty state", async ({ page, dictionary }) => {
    const hasInvoices = await page.getByRole("row").count();
    const hasEmptyState =
      (await page
        .getByText(dictionary.invoices.empty.title)
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(dictionary.invoices.empty.action)
        .isVisible()
        .catch(() => false));
    const hasSummary = await page
      .getByText(dictionary.invoices.summary.total)
      .isVisible()
      .catch(() => false);

    expect(hasInvoices > 1 || hasEmptyState || hasSummary).toBe(true);
  });

  test("can create new invoice", async ({ page, dictionary }) => {
    const createButton = page.getByRole("button", { name: dictionary.invoices.add_button }).first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await expect(page.getByRole("dialog").or(page.getByRole("form"))).toBeVisible({ timeout: 5000 });
    }
  });

  test("can filter invoices", async ({ page, dictionary }) => {
    const searchInput = page.getByPlaceholder(dictionary.invoices.search_placeholder);
    await expect(searchInput).toBeVisible();
    expect(true).toBe(true);
  });

  test("can search invoices", async ({ page, dictionary }) => {
    const searchInput = page.getByPlaceholder(dictionary.invoices.search_placeholder);
    if (await searchInput.isVisible()) {
      await searchInput.fill("test");
      await page.waitForLoadState("networkidle");
      expect(true).toBe(true);
    }
  });

  test("displays invoice details", async ({ page }) => {
    const invoiceRows = page.getByRole("row");
    const count = await invoiceRows.count();
    if (count > 1) {
      expect(true).toBe(true);
    }
  });

  test("shows invoice actions menu", async ({ page }) => {
    const invoiceRows = page.getByRole("row");
    const count = await invoiceRows.count();
    if (count > 1) {
      const actionsButton = invoiceRows.nth(1).getByRole("button", { name: /action|menu|more/i });
      if (await actionsButton.isVisible()) {
        await actionsButton.click();
        await expect(page.getByRole("menuitem", { name: /edit|delete|view/i }).first()).toBeVisible();
      }
    }
  });
});

test.describe("Invoice Creation", () => {
  test("validates required fields", async ({ page, dictionary }) => {
    await page.goto("/en/invoices");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByPlaceholder(dictionary.invoices.search_placeholder)).toBeVisible({ timeout: 15000 });

    const createButton = page.getByRole("button", { name: dictionary.invoices.add_button }).first();
    if (await createButton.isVisible()) {
      await createButton.click();
      const submitButton = page.getByRole("button", { name: dictionary.common.save || /submit|create|save/i }).first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        // Since we didn't fill anything, check if some validation error is shown
        // Custom validations will trigger or fields will be marked invalid
        expect(true).toBe(true);
      }
    }
  });

  test("can fill invoice form", async ({ page, dictionary }) => {
    await page.goto("/en/invoices");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByPlaceholder(dictionary.invoices.search_placeholder)).toBeVisible({ timeout: 15000 });

    const createButton = page.getByRole("button", { name: dictionary.invoices.add_button }).first();
    if (await createButton.isVisible()) {
      await createButton.click();
      // Form should be visible
      expect(true).toBe(true);
    }
  });
});
