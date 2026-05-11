import { expect, test } from "./fixtures";

// These tests are entirely public — no auth needed.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Authentication: Login Form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("should load the login page", async ({ page, dictionary }) => {
    await expect(page).toHaveTitle(new RegExp(dictionary.auth.login_title));
    await expect(page.getByText(dictionary.auth.welcome)).toBeVisible();
  });

  test("should show the OAuth buttons", async ({ page, dictionary }) => {
    // Google & GitHub OAuth buttons are always visible
    await expect(page.getByText(dictionary.auth.show_other_options)).toBeVisible();
  });

  test('should show the email/password form after expanding "Show other options"', async ({ page, dictionary }) => {
    // The login form is inside a <details> element — click the <summary> to open it
    await page.getByText(dictionary.auth.show_other_options).click();
    // Now the form should be visible
    await expect(page.getByLabel(dictionary.auth.form.email_label)).toBeVisible();
    await expect(page.getByLabel(dictionary.auth.form.password_label, { exact: true })).toBeVisible();
  });

  test("should show validation errors on empty login submission", async ({ page, dictionary }) => {
    // Must expand the form first
    await page.getByText(dictionary.auth.show_other_options).click();
    await expect(page.getByLabel(dictionary.auth.form.email_label)).toBeVisible();

    // Click Login button without filling anything
    await page.getByRole("button", { name: dictionary.auth.form.login_button }).click();

    await expect(page.getByText(dictionary.auth.form.validation.email_invalid)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(dictionary.auth.form.validation.password_min)).toBeVisible({ timeout: 10000 });
  });

  test("should show an error with invalid credentials", async ({ page, dictionary }) => {
    await page.getByText(dictionary.auth.show_other_options).click();
    await expect(page.getByLabel(dictionary.auth.form.email_label)).toBeVisible();

    await page.getByLabel(dictionary.auth.form.email_label).fill("invalid@example.com");
    await page.getByLabel(dictionary.auth.form.password_label, { exact: true }).fill("wrongpassword");
    await page.getByRole("button", { name: dictionary.auth.form.login_button }).click();

    // Should NOT redirect to overview
    await expect(page).not.toHaveURL(/.*overview/);
  });
});

test.describe("Authentication: Register Form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/register");
    await page.waitForLoadState("domcontentloaded");
  });

  test("should load the register page", async ({ page, dictionary }) => {
    await expect(page).toHaveTitle(new RegExp(dictionary.auth.register_title));
    await expect(page.getByText(dictionary.auth.welcome)).toBeVisible();
  });

  test('should show the email/password registration form after expanding "Show other options"', async ({
    page,
    dictionary,
  }) => {
    await page.getByText(dictionary.auth.show_other_options).click();
    await expect(page.getByLabel(dictionary.auth.form.email_label)).toBeVisible();
    await expect(page.getByLabel(dictionary.auth.form.password_label, { exact: true })).toBeVisible();
    await expect(page.getByLabel(dictionary.auth.form.confirm_password_label)).toBeVisible();
  });

  test("should show validation errors on empty registration submission", async ({ page, dictionary }) => {
    await page.getByText(dictionary.auth.show_other_options).click();
    await expect(page.getByLabel(dictionary.auth.form.email_label)).toBeVisible();

    await page.getByRole("button", { name: dictionary.auth.form.register_button }).click();

    await expect(page.getByText(dictionary.auth.form.validation.email_invalid)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(dictionary.auth.form.validation.password_min).first()).toBeVisible({ timeout: 10000 });
  });
});
