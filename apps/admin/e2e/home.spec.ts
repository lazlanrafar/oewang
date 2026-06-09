import { test, expect } from "@playwright/test";

test("admin page loads", async ({ page }) => {
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toBeVisible();
});
