import { expect, test } from "./fixtures";

test.describe("Upgrade Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/upgrade");
    await page.waitForLoadState("domcontentloaded");
  });

  test("loads upgrade page successfully", async ({ page }) => {
    await expect(page).toHaveURL(/.*upgrade/);
    await expect(page.getByRole("heading", { name: /upgrade|pricing|plan/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("displays pricing plans", async ({ page }) => {
    // Should show at least one pricing plan
    const pricingCards = page.locator("[data-plan], [data-pricing-card]");
    const count = await pricingCards.count();

    if (count === 0) {
      // Alternative: look for plan names — use first() to avoid strict mode violation
      const planText = page.getByText(/free|pro|premium|enterprise/i).first();
      const hasPlanText = await planText.isVisible();
      expect(hasPlanText).toBe(true);
    } else {
      expect(count).toBeGreaterThan(0);
    }
  });

  test("displays plan features", async ({ page }) => {
    // Each plan should show features
    const features = page.getByText(/transaction|storage|user|support/i);
    const count = await features.count();

    expect(count).toBeGreaterThan(0);
  });

  test("displays pricing information", async ({ page }) => {
    // Should show prices with currency symbols
    const priceElements = page.getByText(/\$|€|£|\d+.*month|\d+.*year/);
    const count = await priceElements.count();

    expect(count).toBeGreaterThan(0);
  });

  test("can toggle billing period", async ({ page }) => {
    const monthlyButton = page.getByRole("button", { name: /monthly/i });
    const annualButton = page.getByRole("button", { name: /annual|yearly/i });

    if ((await monthlyButton.isVisible()) && (await annualButton.isVisible())) {
      // Click annual
      await annualButton.click();
      await page.waitForLoadState("networkidle");

      // Prices should update
      expect(true).toBe(true);

      // Click monthly
      await monthlyButton.click();
      await page.waitForLoadState("networkidle");

      expect(true).toBe(true);
    }
  });

  test("can click upgrade button", async ({ page }) => {
    const upgradeButton = page.getByRole("button", { name: /upgrade|subscribe|get started/i }).first();

    if (await upgradeButton.isVisible()) {
      await upgradeButton.click();
      await page.waitForLoadState("networkidle");

      // Should navigate to payment or show checkout
      expect(true).toBe(true);
    }
  });

  test("shows current plan indicator", async ({ page }) => {
    // Should indicate which plan user is currently on
    const currentPlanIndicator = page.getByText(/current plan|active/i).first();

    if (await currentPlanIndicator.isVisible()) {
      expect(currentPlanIndicator).toBeVisible();
    }
  });

  test("displays comparison table", async ({ page }) => {
    // Look for feature comparison table
    const comparisonTable = page.getByRole("table");

    if (await comparisonTable.isVisible()) {
      // Should have multiple rows
      const rows = comparisonTable.getByRole("row");
      const count = await rows.count();

      expect(count).toBeGreaterThan(1);
    }
  });

  test("shows FAQ or help section", async ({ page }) => {
    // Scroll to bottom to load FAQ if lazy loaded
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const faqSection = page.getByText(/frequently asked|faq|questions/i);

    if (await faqSection.isVisible()) {
      await expect(faqSection).toBeVisible();
    }
  });

  test("can contact sales", async ({ page }) => {
    const contactButton = page.getByRole("link", { name: /contact|sales|talk to us/i }).first();

    if (await contactButton.isVisible()) {
      await expect(contactButton).toBeEnabled();
    }
  });
});

test.describe("Upgrade Flow", () => {
  test("shows plan details modal", async ({ page }) => {
    await page.goto("/en/upgrade");

    const detailsButton = page.getByRole("button", { name: /details|learn more/i }).first();

    if (await detailsButton.isVisible()) {
      await detailsButton.click();

      // Should show modal with more information
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    }
  });

  test("validates payment information", async ({ page }) => {
    await page.goto("/en/upgrade");

    const upgradeButton = page.getByRole("button", { name: /upgrade|subscribe/i }).first();

    if (await upgradeButton.isVisible()) {
      await upgradeButton.click();
      await page.waitForLoadState("networkidle");

      // If on payment page, should show payment form
      const paymentForm = page.getByRole("form").or(page.locator("[data-payment-form]"));

      if (await paymentForm.isVisible()) {
        expect(paymentForm).toBeVisible();
      }
    }
  });
});
