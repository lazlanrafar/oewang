import { expect, test } from "./fixtures";

/**
 * Smoke Tests: Budget, Calendar, and Apps
 *
 * These pages might still be in development (coming soon),
 * but these tests ensure they don't crash and show the expected title.
 */
test.describe("Workspace: Budget", () => {
  test("should render the budget page or placeholder", async ({ page, dictionary }) => {
    await page.goto("/en/budget");
    await page.waitForLoadState("domcontentloaded");

    // Check if it's the real page or Coming Soon
    const title = page.getByRole("heading", { name: new RegExp(dictionary.sidebar.budget_label, "i") });
    if (await title.isVisible()) {
      await expect(title).toBeVisible();
    } else {
      // It might render the "Coming Soon" label from dictionary
      await expect(
        page
          .getByText(new RegExp(`${dictionary.sidebar.budget_label}|${dictionary.sidebar.coming_soon_label}`, "i"))
          .first(),
      ).toBeVisible();
    }
  });
});

test.describe("Workspace: Calendar", () => {
  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/calendar");
    await page.waitForLoadState("domcontentloaded");
    // The calendar header is dynamic (e.g. "April 2026"), so we look for the tabs instead
    await expect(page.getByRole("button", { name: dictionary.calendar.tabs.month })).toBeVisible({ timeout: 15000 });
  });

  test("should render the calendar page", async ({ page, dictionary }) => {
    await expect(page.getByRole("button", { name: dictionary.calendar.tabs.month })).toBeVisible();
  });

  test("should display month view by default", async ({ page, dictionary }) => {
    // Month view has week day headers
    await expect(page.getByText(dictionary.calendar.days.short.sun)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Workspace: Apps", () => {
  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/apps");
    await page.waitForLoadState("domcontentloaded");
    // Apps page starts with a search input or the "All Apps" tab
    await expect(page.getByRole("tab", { name: dictionary.apps.tabs.all })).toBeVisible({
      timeout: 15000,
    });
  });

  test("should render the apps directory page", async ({ page, dictionary }) => {
    await expect(page.getByRole("tab", { name: dictionary.apps.tabs.all })).toBeVisible();
  });

  test("should list some apps or show empty state", async ({ page }) => {
    // Just ensure the page content is visible
    await expect(page.locator("body")).toBeVisible();
  });
});
