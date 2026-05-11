import { expect, test } from "./fixtures";

/**
 * Workspace: Navigation, Sidebar, and Global UI
 */
test.describe("Workspace: Sidebar & Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/overview");
    await page.waitForLoadState("domcontentloaded");
  });

  test("should display the sidebar", async ({ page }) => {
    const sidebar = page.locator("aside").or(page.locator('[data-sidebar="sidebar"]'));
    await expect(sidebar.first()).toBeVisible();
  });

  test("should navigate to Transactions page via sidebar", async ({ page, dictionary }) => {
    // Navigate using the sidebar link
    await page
      .getByRole("link", { name: new RegExp(dictionary.sidebar.transactions_label, "i") })
      .first()
      .click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/.*transactions/);
  });

  test("should navigate back to Overview via sidebar", async ({ page, dictionary }) => {
    // Go to Transactions first
    await page
      .getByRole("link", { name: new RegExp(dictionary.sidebar.transactions_label, "i") })
      .first()
      .click();
    await page.waitForLoadState("domcontentloaded");

    // Navigate back to Overview using the sidebar link
    // Sidebar usually has 'Overview' as the first link
    await page
      .getByRole("link", { name: new RegExp(dictionary.sidebar.overview_label, "i") })
      .first()
      .click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/.*overview/);
  });

  test("should navigate to Settings via sidebar", async ({ page, dictionary }) => {
    await page
      .getByRole("link", { name: new RegExp(dictionary.sidebar.settings_label, "i") })
      .first()
      .click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/.*settings/);
  });
});

test.describe("Workspace: Switcher", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/overview");
    await page.waitForLoadState("domcontentloaded");
  });

  test("should show the workspace switcher", async ({ page }) => {
    // Workspace switcher is a button in the sidebar header showing workspace name and plan
    const switcher = page
      .getByRole("button")
      .filter({ hasText: /Free|Pro/i })
      .first();
    await expect(switcher).toBeVisible();
  });

  test("should open workspace switcher menu", async ({ page }) => {
    const switcher = page
      .getByRole("button")
      .filter({ hasText: /Free|Pro/i })
      .first();
    await switcher.click();
    await expect(page.getByText(/Workspaces/i).first()).toBeVisible();
  });
});
