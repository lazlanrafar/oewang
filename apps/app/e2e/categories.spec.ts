import { expect, test } from "./fixtures";

/**
 * Finance: Categories (Income & Expense)
 * Settings URLs:
 *   - /en/settings/income-category
 *   - /en/settings/expense-category
 *
 * The page title (<h1>) is what identifies the section.
 * "Income Categories" matches strictly against the heading, not sidebar text.
 */
test.describe("Finance: Income Categories", () => {
  const testCategoryName = `E2E Income Cat ${Date.now()}`;

  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/settings/income-category");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the Add Category button to appear (signals hydration complete)
    await expect(page.getByRole("button", { name: dictionary.settings.category.income.add_button })).toBeVisible({
      timeout: 15000,
    });
  });

  test("should render the income categories page", async ({ page, dictionary }) => {
    // CategoryForm uses h2 for the title
    await expect(page.getByRole("heading", { name: dictionary.settings.category.income.title, level: 2 })).toBeVisible({
      timeout: 10000,
    });
  });

  test("should open the Add Category form", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.settings.category.income.add_button }).click();
    await expect(page.getByPlaceholder(dictionary.settings.category.income.form.name.placeholder)).toBeVisible({
      timeout: 5000,
    });
  });

  test("should show validation error for empty category name", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.settings.category.income.add_button }).click();
    await expect(page.getByPlaceholder(dictionary.settings.category.income.form.name.placeholder)).toBeVisible({
      timeout: 5000,
    });

    await page.getByRole("button", { name: dictionary.settings.category.income.form.submit }).click();
    // Validation message rendering can be slightly delayed
    await expect(page.getByText(dictionary.settings.category.income.form.name.error_required)).toBeVisible({
      timeout: 10000,
    });
  });

  test("should create a new income category", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.settings.category.income.add_button }).click();
    await page.getByPlaceholder(dictionary.settings.category.income.form.name.placeholder).fill(testCategoryName);
    await page.getByRole("button", { name: dictionary.settings.category.income.form.submit }).click();

    await expect(page.getByText(dictionary.settings.category.income.form.create_success)).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe("Finance: Expense Categories", () => {
  const testCategoryName = `E2E Expense Cat ${Date.now()}`;

  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/settings/expense-category");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("button", { name: dictionary.settings.category.expense.add_button })).toBeVisible({
      timeout: 15000,
    });
  });

  test("should render the expense categories page", async ({ page, dictionary }) => {
    // CategoryForm uses h2
    await expect(page.getByRole("heading", { name: dictionary.settings.category.expense.title, level: 2 })).toBeVisible(
      { timeout: 10000 },
    );
  });

  test("should open the Add Category form", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.settings.category.expense.add_button }).click();
    await expect(page.getByPlaceholder(dictionary.settings.category.expense.form.name.placeholder)).toBeVisible({
      timeout: 5000,
    });
  });

  test("should show validation error for empty category name", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.settings.category.expense.add_button }).click();
    await expect(page.getByPlaceholder(dictionary.settings.category.expense.form.name.placeholder)).toBeVisible({
      timeout: 5000,
    });

    await page.getByRole("button", { name: dictionary.settings.category.expense.form.submit }).click();
    await expect(page.getByText(dictionary.settings.category.expense.form.name.error_required)).toBeVisible({
      timeout: 10000,
    });
  });

  test("should create a new expense category", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.settings.category.expense.add_button }).click();
    await page.getByPlaceholder(dictionary.settings.category.expense.form.name.placeholder).fill(testCategoryName);
    await page.getByRole("button", { name: dictionary.settings.category.expense.form.submit }).click();

    await expect(page.getByText(dictionary.settings.category.expense.form.create_success)).toBeVisible({
      timeout: 15000,
    });
  });
});
