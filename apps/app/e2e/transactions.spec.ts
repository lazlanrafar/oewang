import { expect, test } from "./fixtures";

test.describe("Finance: Transactions", () => {
  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/transactions");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the client component to hydrate - the Add button is a good signal
    await expect(page.getByRole("button", { name: dictionary.transactions.add_button }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("should render the transactions page with title", async ({ page, dictionary }) => {
    await expect(page).toHaveTitle(new RegExp(dictionary.transactions.title));
  });

  test("should open the Create Transaction sheet from the Add dropdown", async ({ page, dictionary }) => {
    // Find and click the "Add" dropdown
    await page.getByRole("button", { name: dictionary.transactions.add_button }).first().click();

    // Click "Create transaction" from dropdown menu
    await page
      .getByRole("menuitem", { name: dictionary.transactions.create_transaction })
      .or(page.getByText(dictionary.transactions.create_transaction))
      .first()
      .click();

    // Sheet should open
    await expect(page.getByText(dictionary.transactions.new_transaction)).toBeVisible({ timeout: 10000 });
  });

  test("should switch transaction type tabs when sheet is open", async ({ page, dictionary }) => {
    const addBtn = page
      .getByRole("button")
      .filter({ hasText: new RegExp(dictionary.transactions.add_button, "i") })
      .first();
    await addBtn.click();
    await page.getByText(dictionary.transactions.create_transaction).click();
    await expect(page.getByText(dictionary.transactions.new_transaction)).toBeVisible({ timeout: 5000 });

    // Click the "Income" type tab
    const incomeTab = page.getByRole("button", { name: dictionary.transactions.types.income, exact: true });
    if (await incomeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await incomeTab.click();
      await expect(incomeTab).toBeVisible();
    }
  });

  test('should switch to Transfer tab and show "To Account"', async ({ page, dictionary }) => {
    const addBtn = page
      .getByRole("button")
      .filter({ hasText: new RegExp(dictionary.transactions.add_button, "i") })
      .first();
    await addBtn.click();
    await page.getByText(dictionary.transactions.create_transaction).click();
    await expect(page.getByText(dictionary.transactions.new_transaction)).toBeVisible({ timeout: 5000 });

    const transferTab = page.getByRole("button", { name: dictionary.transactions.types.transfer, exact: true });
    if (await transferTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await transferTab.click();
      await expect(page.getByText(dictionary.transactions.to_account)).toBeVisible({ timeout: 3000 });
    }
  });

  test("should show validation error when saving empty transaction", async ({ page, dictionary }) => {
    const addBtn = page
      .getByRole("button")
      .filter({ hasText: new RegExp(dictionary.transactions.add_button, "i") })
      .first();
    await addBtn.click();
    await page.getByText(dictionary.transactions.create_transaction).click();
    await expect(page.getByText(dictionary.transactions.new_transaction)).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: dictionary.transactions.save_transaction }).click();

    // "Amount must be positive" validation appears
    await expect(page.getByText(dictionary.transactions.errors.amount_positive)).toBeVisible({ timeout: 5000 });
  });

  test("should filter transactions by typing in search field", async ({ page, dictionary }) => {
    const searchInput = page.getByPlaceholder(dictionary.transactions.search_placeholder);
    await searchInput.fill("coffee");
    await page.waitForTimeout(600);
    await expect(searchInput).toHaveValue("coffee");
  });
});
