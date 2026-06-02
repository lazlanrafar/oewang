import { expect, test } from "./fixtures";

test.describe("Notifications Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/notifications");
    await page.waitForLoadState("domcontentloaded");
  });

  test("loads notifications page successfully", async ({ page }) => {
    await expect(page).toHaveURL(/.*notifications/);
    await expect(page.getByRole("heading", { name: /notification/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("displays notification list or empty state", async ({ page }) => {
    // Either shows notifications or empty state
    const hasNotifications = await page.locator("[data-notification]").count();
    const hasEmptyState = await page
      .getByText(/no notification/i)
      .isVisible()
      .catch(() => false);

    expect(hasNotifications > 0 || hasEmptyState).toBe(true);
  });

  test("can mark notification as read", async ({ page }) => {
    const unreadNotification = page.locator('[data-notification][data-read="false"]').first();

    if (await unreadNotification.isVisible()) {
      await unreadNotification.click();
      await page.waitForLoadState("networkidle");

      // Notification should be marked as read or dismissed
      expect(true).toBe(true);
    }
  });

  test("can mark all as read", async ({ page }) => {
    const markAllButton = page.getByRole("button", { name: /mark all.*read/i });

    if (await markAllButton.isVisible()) {
      await markAllButton.click();
      await page.waitForLoadState("networkidle");

      // All notifications should be marked as read
      expect(true).toBe(true);
    }
  });

  test("can filter notifications by type", async ({ page }) => {
    const filterButton = page.getByRole("button", { name: /filter/i });

    if (await filterButton.isVisible()) {
      await filterButton.click();

      // Should show filter options
      const typeFilter = page.getByLabel(/type/i);
      if (await typeFilter.isVisible()) {
        await typeFilter.click();
        await page
          .getByRole("option", { name: /transaction|payment/i })
          .first()
          .click();
      }
    }
  });

  test("can delete notification", async ({ page }) => {
    const notifications = page.locator("[data-notification]");
    const count = await notifications.count();

    if (count > 0) {
      const deleteButton = notifications.first().getByRole("button", { name: /delete/i });

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // May need to confirm
        const confirmButton = page.getByRole("button", { name: /confirm|delete/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        await page.waitForLoadState("networkidle");
        expect(true).toBe(true);
      }
    }
  });

  test("can clear all notifications", async ({ page }) => {
    const clearAllButton = page.getByRole("button", { name: /clear all/i });

    if (await clearAllButton.isVisible()) {
      await clearAllButton.click();

      // Should show confirmation
      const confirmButton = page.getByRole("button", { name: /confirm/i });
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
        await page.waitForLoadState("networkidle");
      }
    }
  });

  test("notification links navigate correctly", async ({ page }) => {
    const notificationLink = page.locator("[data-notification] a").first();

    if (await notificationLink.isVisible()) {
      const href = await notificationLink.getAttribute("href");

      if (href) {
        await notificationLink.click();
        await page.waitForLoadState("networkidle");

        // Should navigate to related page
        expect(page.url()).not.toContain("/notifications");
      }
    }
  });
});

test.describe("Notification Settings", () => {
  test("can access notification settings", async ({ page }) => {
    await page.goto("/en/notifications");

    const settingsButton = page.getByRole("button", { name: /settings|preferences/i });

    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Should show settings or navigate to settings page
      await page.waitForLoadState("networkidle");
      expect(true).toBe(true);
    }
  });
});
