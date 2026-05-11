import { expect, test } from "./fixtures";

// These tests are entirely public — no auth needed.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Public: Home Page (Redirects)", () => {
  test("should redirect unauthenticated users from overview to login", async ({ page, dictionary }) => {
    // Try to visit protected route
    await page.goto("/en/overview");
    await page.waitForLoadState("domcontentloaded");

    // Should be redirected to login
    await expect(page).toHaveURL(/.*login/);
    await expect(page.getByText(dictionary.auth.welcome)).toBeVisible();
  });

  test("should load the index route and redirect to login if unauthenticated", async ({ page }) => {
    // Navigating to root / should redirect based on auth status
    // Middleware handles this
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // It might redirect to /en/login or /login
    await expect(page).toHaveURL(/.*login/);
  });
});
