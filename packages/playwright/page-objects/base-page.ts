import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Base Page Object Model
 * All page objects should extend this class
 */
export class BasePage {
  constructor(protected page: Page) {}

  /**
   * Navigate to a path
   */
  async goto(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState("domcontentloaded");
  }

  /**
   * Wait for element to be visible
   */
  async waitForElement(
    selector: string,
    options?: { timeout?: number; state?: "visible" | "hidden" | "attached" },
  ) {
    await this.page.waitForSelector(selector, {
      state: options?.state || "visible",
      timeout: options?.timeout,
    });
  }

  /**
   * Wait for network to be idle
   */
  async waitForNetwork() {
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Click button by text
   */
  async clickButton(text: string | RegExp) {
    await this.page.getByRole("button", { name: text }).click();
  }

  /**
   * Click button by test ID
   */
  async clickByTestId(testId: string) {
    await this.page.getByTestId(testId).click();
  }

  /**
   * Fill input by label
   */
  async fillInput(label: string | RegExp, value: string) {
    await this.page.getByLabel(label).fill(value);
  }

  /**
   * Select option from dropdown
   */
  async selectOption(label: string | RegExp, value: string) {
    await this.page.getByLabel(label).selectOption(value);
  }

  /**
   * Check checkbox by label
   */
  async checkBox(label: string | RegExp) {
    await this.page.getByLabel(label).check();
  }

  /**
   * Get text content of an element
   */
  async getText(selector: string): Promise<string> {
    return (await this.page.textContent(selector)) || "";
  }

  /**
   * Wait for URL to match pattern
   */
  async waitForURL(pattern: string | RegExp, options?: { timeout?: number }) {
    await this.page.waitForURL(pattern, options);
  }

  /**
   * Wait for toast/notification message (using Sonner)
   */
  async waitForToast(
    message?: string | RegExp,
    options?: { timeout?: number },
  ) {
    const toastSelector = "[data-sonner-toast]";
    await this.waitForElement(toastSelector, options);

    if (message) {
      await expect(this.page.getByText(message)).toBeVisible(options);
    }
  }

  /**
   * Close toast notifications
   */
  async closeToasts() {
    const closeButtons = this.page.locator(
      '[data-sonner-toast] button[aria-label="Close"]',
    );
    const count = await closeButtons.count();
    for (let i = 0; i < count; i++) {
      await closeButtons.nth(0).click();
    }
  }

  /**
   * Take screenshot
   */
  async screenshot(name: string, options?: { fullPage?: boolean }) {
    await this.page.screenshot({
      path: `screenshots/${name}.png`,
      fullPage: options?.fullPage ?? true,
    });
  }

  /**
   * Reload the page
   */
  async reload() {
    await this.page.reload();
    await this.waitForNetwork();
  }

  /**
   * Go back
   */
  async goBack() {
    await this.page.goBack();
    await this.waitForNetwork();
  }

  /**
   * Get element by test ID
   */
  getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /**
   * Get element by role
   */
  getByRole(
    role: "button" | "link" | "textbox" | "checkbox" | "radio" | "heading",
    options?: { name?: string | RegExp },
  ): Locator {
    return this.page.getByRole(role, options);
  }

  /**
   * Get element by text
   */
  getByText(text: string | RegExp): Locator {
    return this.page.getByText(text);
  }

  /**
   * Expect element to be visible
   */
  async expectVisible(locator: Locator | string) {
    if (typeof locator === "string") {
      await expect(this.page.locator(locator)).toBeVisible();
    } else {
      await expect(locator).toBeVisible();
    }
  }

  /**
   * Expect element not to be visible
   */
  async expectNotVisible(locator: Locator | string) {
    if (typeof locator === "string") {
      await expect(this.page.locator(locator)).not.toBeVisible();
    } else {
      await expect(locator).not.toBeVisible();
    }
  }
}
