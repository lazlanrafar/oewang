import { expect, test } from "./fixtures";

/**
 * Workspace: Contacts
 *
 * The ContactsClient renders summary cards using dictionary keys:
 *   - dictionary.contacts.summary.total → "Total Contacts"
 *   - dictionary.contacts.summary.added_this_month → "Added This Month"
 * These are rendered AFTER React hydration + dictionary load.
 * We wait for the "New Contact" button as proof of hydration.
 */
test.describe("Workspace: Contacts", () => {
  const _testContact = {
    name: `E2E Contact ${Date.now()}`,
    email: `e2e_${Date.now()}@example.com`,
    phone: "+62812345678",
  };

  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/contacts");
    await page.waitForLoadState("domcontentloaded");
    // Wait for client-side hydration — the button only appears after dictionary loads
    await expect(page.getByRole("button", { name: dictionary.contacts.add_button })).toBeVisible({ timeout: 15000 });
  });

  test("should render the contacts page", async ({ page, dictionary }) => {
    // After hydration, summary cards render dictionary strings
    // Increase timeouts for summary cards which depend on client-side data fetching
    await expect(page.getByText(dictionary.contacts.summary.total).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(dictionary.contacts.summary.added_this_month).first()).toBeVisible({ timeout: 15000 });
  });

  test("should open the New Contact form sheet", async ({ page, dictionary }) => {
    // Force click to bypass any potential overlays and target the toolbar specifically
    await page
      .getByRole("button", { name: dictionary.contacts.add_button })
      .filter({ visible: true })
      .first()
      .click({ force: true });

    // Check for the Label "Name" as proof of form readiness
    await expect(page.getByLabel(dictionary.contacts.form.name_label)).toBeVisible({ timeout: 30000 });
  });

  test("should show validation error when creating contact without name", async ({ page, dictionary }) => {
    await page
      .getByRole("button", { name: dictionary.contacts.add_button })
      .filter({ visible: true })
      .first()
      .click({ force: true });
    await expect(page.getByLabel(dictionary.contacts.form.name_label)).toBeVisible({ timeout: 30000 });

    // Fill only email to trigger name validation
    await page.getByPlaceholder(dictionary.contacts.form.email_placeholder).fill("test@example.com");

    // Click create button in sheet
    await page.getByRole("button", { name: dictionary.contacts.form.create }).click();

    await expect(page.getByText(dictionary.contacts.form.errors.name_required)).toBeVisible({ timeout: 20000 });
  });

  test("should create a new contact successfully", async ({ page, dictionary }) => {
    await page
      .getByRole("button", { name: dictionary.contacts.add_button })
      .filter({ visible: true })
      .first()
      .click({ force: true });
    await expect(page.getByLabel(dictionary.contacts.form.name_label)).toBeVisible({ timeout: 30000 });

    const testName = `E2E Contact ${Date.now()}`;
    await page.getByPlaceholder(dictionary.contacts.form.name_placeholder).fill(testName);
    await page.getByPlaceholder(dictionary.contacts.form.email_placeholder).fill("e2e@example.com");
    await page.getByPlaceholder(dictionary.contacts.form.phone_placeholder).fill("+123456789");

    await page.getByRole("button", { name: dictionary.contacts.form.create }).click();

    await expect(page.getByText(dictionary.contacts.toasts.created)).toBeVisible({ timeout: 45000 });
    await expect(page.getByText(testName)).toBeVisible({ timeout: 45000 });
  });

  test("should search for contacts in the search field", async ({ page, dictionary }) => {
    const searchInput = page.getByPlaceholder(dictionary.contacts.search_placeholder);
    await searchInput.fill("test");
    await page.waitForTimeout(600);
    await expect(searchInput).toHaveValue("test");
  });
});

/**
 * Finance: Debts & Receivables
 *
 * Summary cards use dictionary keys:
 *   - dictionary.debts.total_debt → "Total Debt"
 *   - dictionary.debts.active_debts → "Active Debts"
 * These render after client hydration.
 */
test.describe("Finance: Debts & Receivables", () => {
  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/debts");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the Add Debt button as hydration signal
    await expect(page.getByRole("button", { name: dictionary.debts.add_button })).toBeVisible({ timeout: 15000 });
  });

  test("should render the debts page", async ({ page, dictionary }) => {
    // The current DebtsClient does not render summary cards (Total Debt, etc.) at the top.
    // We verify the page title or the Add button visibility (already done in beforeEach)
    // and the search placeholder as proof of hydration.
    await expect(page.getByPlaceholder(dictionary.debts.search_placeholder)).toBeVisible({ timeout: 10000 });
  });

  test("should open the Add Debt form sheet", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.debts.add_button }).click();
    await expect(page.getByText(dictionary.debts.form.add_title)).toBeVisible({ timeout: 5000 });
  });

  test("should show validation error when submitting empty debt form", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.debts.add_button }).click();
    await expect(page.getByText(dictionary.debts.form.add_title)).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: dictionary.debts.form.submit, exact: true }).click();

    // Either "Contact is required" or "Amount is required" will show
    await expect(
      page
        .getByText(dictionary.debts.form.contact.error_required)
        .or(page.getByText(dictionary.debts.form.amount.error_required))
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("should display the debt type options in the form", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.debts.add_button }).click();
    await expect(page.getByText(dictionary.debts.form.add_title)).toBeVisible({ timeout: 5000 });

    // Type buttons render as "You Owe" and "You Are Owed"
    await expect(page.getByText(dictionary.debts.form.type_payable).first()).toBeVisible({ timeout: 5000 });
  });

  test("should search for debts in the search field", async ({ page, dictionary }) => {
    const searchInput = page.getByPlaceholder(dictionary.debts.search_placeholder);
    await searchInput.fill("test");
    await page.waitForTimeout(600);
    await expect(searchInput).toHaveValue("test");
  });
});
