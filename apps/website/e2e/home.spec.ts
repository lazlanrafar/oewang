import { expect, test } from "@playwright/test";

test("website page loads", async ({ page }) => {
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toBeVisible();
});
