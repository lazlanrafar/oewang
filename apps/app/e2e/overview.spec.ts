import { expect, test } from "./fixtures";

test.describe("Dashboard: Overview", () => {
  test.beforeEach(async ({ page }) => {
    // Authenticated state is handled by auth.setup.ts
    await page.goto("/en/overview");
    await page.waitForLoadState("domcontentloaded");
    // Wait for hydration by checking for the Overview tab
    await expect(page.getByRole("tab", { name: /Overview/i })).toBeVisible({ timeout: 15000 });
  });

  test("should render the dashboard title", async ({ page, dictionary }) => {
    // Dashboard header uses tabs for navigation, so check for the Overview tab
    await expect(page.getByRole("tab", { name: dictionary.overview.tabs.overview })).toBeVisible({ timeout: 15000 });
  });

  test("should display major components of the dashboard", async ({ page, dictionary }) => {
    // Summary cards like "Total Income", "Total Expenses" should appear
    await expect(page.getByText(dictionary.overview.metrics.total_income).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(dictionary.overview.metrics.total_expenses).first()).toBeVisible({ timeout: 10000 });
  });

  test("should interact with sidebar navigation from dashboard", async ({ page, dictionary }) => {
    // Click Transactions link in sidebar
    await page
      .getByRole("link", { name: new RegExp(dictionary.sidebar.transactions_label, "i") })
      .first()
      .click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/.*transactions/);
  });
});
