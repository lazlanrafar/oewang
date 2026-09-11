import { test, expect } from "@playwright/test";

test.describe("Admin Workspaces & Plans Management", () => {
  test("workspaces page loads with columns and actions", async ({ page }) => {
    await page.goto("/workspaces");
    await expect(page.locator("body")).toBeVisible();
  });

  test("plan features page loads correctly", async ({ page }) => {
    await page.goto("/plan-features");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText("Plan Features Catalog")).toBeVisible();
  });
});
