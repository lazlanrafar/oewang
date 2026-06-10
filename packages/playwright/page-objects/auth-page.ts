import { type Page, expect } from "@playwright/test";
import { BasePage } from "./base-page";

/**
 * Page Object for authentication pages (login, register)
 */
export class AuthPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to login page
   */
  async gotoLogin(locale = "en") {
    await this.goto(`/${locale}/login`);
  }

  /**
   * Navigate to register page
   */
  async gotoRegister(locale = "en") {
    await this.goto(`/${locale}/register`);
  }

  /**
   * Expand email/password form (from collapsed state)
   */
  async expandEmailForm() {
    const showOtherOptions = this.page.getByText("Show other options");
    if (await showOtherOptions.isVisible()) {
      await showOtherOptions.click();
      await this.waitForElement('input[type="email"]');
    }
  }

  /**
   * Fill login form
   */
  async fillLoginForm(email: string, password: string) {
    await this.expandEmailForm();
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password", { exact: true }).fill(password);
  }

  /**
   * Submit login form
   */
  async submitLogin() {
    await this.clickButton("Login");
  }

  /**
   * Complete login flow
   */
  async login(email: string, password: string, locale = "en") {
    await this.gotoLogin(locale);
    await this.fillLoginForm(email, password);
    await this.submitLogin();
    await this.waitForURL(/.*overview/, { timeout: 10000 });
  }

  /**
   * Fill register form
   */
  async fillRegisterForm(
    email: string,
    password: string,
    confirmPassword?: string,
  ) {
    await this.expandEmailForm();
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password", { exact: true }).fill(password);
    await this.page
      .getByLabel("Confirm Password")
      .fill(confirmPassword || password);
  }

  /**
   * Submit register form
   */
  async submitRegister() {
    await this.clickButton("Register");
  }

  /**
   * Complete registration flow
   */
  async register(email: string, password: string, locale = "en") {
    await this.gotoRegister(locale);
    await this.fillRegisterForm(email, password);
    await this.submitRegister();
  }

  /**
   * Click OAuth button (Google, GitHub, etc.)
   */
  async clickOAuth(provider: "Google" | "GitHub") {
    await this.clickButton(new RegExp(provider, "i"));
  }

  /**
   * Check for validation error
   */
  async expectValidationError(message: string | RegExp) {
    await expect(this.page.getByText(message)).toBeVisible();
  }

  /**
   * Check for successful login (redirect to overview)
   */
  async expectLoggedIn() {
    await expect(this.page).toHaveURL(/.*overview/);
  }

  /**
   * Logout
   */
  async logout() {
    // Click user menu
    await this.page.getByTestId("user-menu-trigger").click();
    // Click logout
    await this.clickButton("Logout");
    await this.waitForURL(/.*login/);
  }
}
