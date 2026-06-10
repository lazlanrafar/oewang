import { expect, test } from "@playwright/test";

test.describe("homepage", () => {
  test("loads with visible body", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("body")).toBeVisible();
  });

  test("has a single h1", async ({ page }) => {
    await page.goto("/en");
    const h1s = page.locator("h1");
    await expect(h1s).toHaveCount(1);
    await expect(h1s.first()).toBeVisible();
  });

  test("anchor sections are present", async ({ page }) => {
    await page.goto("/en");
    for (const id of ["overview", "capture", "clarity", "ai", "workspaces", "start"]) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
  });

  test("hero CTA points to register", async ({ page }) => {
    await page.goto("/en");
    const cta = page.locator('a[href*="/register"]').first();
    await expect(cta).toBeVisible();
  });

  test("no horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

test.describe("header navigation", () => {
  test("desktop anchor links are present", async ({ page }) => {
    await page.goto("/en");
    const overviewLink = page.locator('nav a[href="#overview"], nav a[href="#capture"]').first();
    await expect(overviewLink).toBeVisible();
  });

  test("mobile menu opens and closes on anchor click", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en");
    await page.getByRole("button", { name: "Open menu" }).click();
    // The mobile panel link is .nth(1) — .first() is the hidden desktop nav link
    const menuLink = page.locator('[href="#capture"]').nth(1);
    await expect(menuLink).toBeVisible();
    await menuLink.click();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible({
      timeout: 3000,
    });
  });
});

test.describe("footer", () => {
  test("legal links are functional", async ({ page }) => {
    await page.goto("/en");
    const termsLink = page.locator('footer a[href*="/terms"]');
    await expect(termsLink).toBeVisible();
    const privacyLink = page.locator('footer a[href*="/policy"]');
    await expect(privacyLink).toBeVisible();
  });

  test("has no links to removed marketing pages", async ({ page }) => {
    await page.goto("/en");
    const forbidden = ["/features", "/pricing", "/story", "/integrations", "/docs", "/support", "/updates"];
    for (const path of forbidden) {
      const link = page.locator(`footer a[href$="${path}"]`);
      await expect(link).toHaveCount(0);
    }
  });
});

test.describe("legal pages", () => {
  test("terms page loads", async ({ page }) => {
    await page.goto("/en/terms");
    await expect(page.locator("body")).toBeVisible();
    await expect(page).not.toHaveURL(/\/_not-found/);
  });

  test("policy page loads", async ({ page }) => {
    await page.goto("/en/policy");
    await expect(page.locator("body")).toBeVisible();
    await expect(page).not.toHaveURL(/\/_not-found/);
  });
});

test.describe("removed routes redirect", () => {
  test("features redirects to homepage", async ({ page }) => {
    await page.goto("/en/features");
    await expect(page).toHaveURL(/\/en$/);
  });

  test("pricing redirects to homepage", async ({ page }) => {
    await page.goto("/en/pricing");
    await expect(page).toHaveURL(/\/en$/);
  });

  test("updates redirects to homepage", async ({ page }) => {
    await page.goto("/en/updates");
    await expect(page).toHaveURL(/\/en$/);
  });

  test("integrations redirects to homepage", async ({ page }) => {
    await page.goto("/en/integrations");
    await expect(page).toHaveURL(/\/en$/);
  });
});

test.describe("locales", () => {
  for (const locale of ["en", "id", "ja"]) {
    test(`${locale} homepage renders`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator("h1")).toBeVisible();
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toContain("undefined");
    });
  }

  test("language switcher changes locale", async ({ page }) => {
    await page.goto("/en");
    await page.locator('footer a[href^="/id"]').first().click();
    await expect(page).toHaveURL(/^.*\/id/);
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("SEO", () => {
  test("homepage has meta description", async ({ page }) => {
    await page.goto("/en");
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).toBeTruthy();
  });

  test("JSON-LD parses on homepage", async ({ page }) => {
    await page.goto("/en");
    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(() => JSON.parse(script)).not.toThrow();
    }
  });
});
