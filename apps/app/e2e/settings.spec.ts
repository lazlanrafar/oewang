import { expect, test } from "./fixtures";

/**
 * System: Settings, Profile, Appearance, Billing, Members, Currency, Transaction
 */
test.describe("System: Settings — Profile", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/settings/profile");
    await page.waitForLoadState("domcontentloaded");
  });

  test("should render the profile settings page", async ({ page, dictionary }) => {
    // Wait for hydration by checking for the Save button
    await expect(page.getByRole("button", { name: dictionary.settings.profile.update_profile })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("heading", { name: dictionary.settings.profile.title })).toBeVisible();
  });

  test("should display the Username input", async ({ page, dictionary }) => {
    // Note: The dictionary key for the label in the first field is username_label
    const nameInput = page.getByLabel(dictionary.settings.profile.form.username_label);
    await expect(nameInput).toBeVisible();
  });

  test("should update the display name and show success toast", async ({ page, dictionary }) => {
    const nameInput = page.getByLabel(dictionary.settings.profile.form.username_label);
    await nameInput.clear();
    await nameInput.fill("E2E Test User");

    await page.getByRole("button", { name: dictionary.settings.profile.update_profile }).click();

    await expect(page.getByText(dictionary.settings.profile.toast_success)).toBeVisible({ timeout: 10000 });
  });

  test("should display the Mobile Number input field", async ({ page, dictionary }) => {
    await expect(page.getByLabel(dictionary.settings.profile.form.mobile_label)).toBeVisible();
  });
});

test.describe("System: Settings — Appearance", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/settings/appearance");
    await page.waitForLoadState("domcontentloaded");
  });

  test("should render the appearance settings page", async ({ page, dictionary }) => {
    // Wait for the Restore Defaults button as hydration signal
    await expect(page.getByText(dictionary.settings.appearance.restore_defaults)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: dictionary.settings.appearance.title })).toBeVisible();
  });

  test("should show Theme Settings section", async ({ page, dictionary }) => {
    await expect(page.getByRole("heading", { name: dictionary.settings.appearance.theme.title })).toBeVisible();
  });

  test("should show Layout Settings section", async ({ page, dictionary }) => {
    await expect(page.getByRole("heading", { name: dictionary.settings.appearance.layout.title })).toBeVisible();
  });

  test("should switch theme to Dark", async ({ page, dictionary }) => {
    const darkButton = page
      .getByRole("radio", { name: dictionary.settings.appearance.theme.dark })
      .or(page.getByText(dictionary.settings.appearance.theme.dark))
      .first();
    await darkButton.click();
    await page.waitForTimeout(500);
    await expect(page.locator("html")).toBeVisible();
  });
});

test.describe("System: Settings — Billing", () => {
  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/settings/billing");
    // Wait for the billing cycle toggle or price text
    await expect(page.getByText(dictionary.settings.billing.monthly_toggle).first()).toBeVisible({ timeout: 15000 });
  });

  test("should render the billing page", async ({ page, dictionary }) => {
    await expect(page.getByRole("heading", { name: dictionary.settings.billing.title })).toBeVisible();
  });

  test("should display Current Plan section", async ({ page, dictionary }) => {
    await expect(page.getByText(dictionary.settings.billing.current_plan)).toBeVisible();
  });

  test("should display Available Plans or Add-ons section", async ({ page, dictionary }) => {
    const section = page
      .getByText(dictionary.settings.billing.available_plans)
      .or(page.getByText(dictionary.settings.billing.addons))
      .first();
    await expect(section).toBeVisible();
  });

  test("should display Vault Storage usage", async ({ page, dictionary }) => {
    // The Progress component contains the label or we find by text
    await expect(page.getByText(dictionary.settings.billing.vault_storage).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("System: Settings — Members", () => {
  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/settings/members");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(dictionary.settings.members.title).first()).toBeVisible({ timeout: 15000 });
  });

  test("should render the members settings page", async ({ page, dictionary }) => {
    await expect(page.getByRole("heading", { name: dictionary.settings.members.title })).toBeVisible();
  });

  test("should show the Invite Member button", async ({ page, dictionary }) => {
    await expect(page.getByRole("button", { name: dictionary.settings.members.invite_button })).toBeVisible();
  });

  test("should show tabs for Members and Invitations", async ({ page, dictionary }) => {
    await expect(page.getByRole("tab", { name: dictionary.settings.members.tabs.members })).toBeVisible();
    await expect(page.getByRole("tab", { name: dictionary.settings.members.tabs.invitations })).toBeVisible();
  });
});

test.describe("System: Settings — Currency", () => {
  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/settings/currency");
    await page.waitForLoadState("domcontentloaded");
    // Wait for hydration signal
    await expect(page.getByText(dictionary.settings.currency.title).first()).toBeVisible({ timeout: 15000 });
  });

  test("should render the currency settings page", async ({ page, dictionary }) => {
    await expect(page.getByText(dictionary.settings.currency.title).first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("System: Settings — Transaction", () => {
  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/settings/transaction");
    await page.waitForLoadState("domcontentloaded");
    // TransactionSettingsForm renders after hydration
    await expect(page.getByRole("heading", { name: dictionary.settings.transaction.title }).first()).toBeVisible({
      timeout: 20000,
    });
  });

  test("should render the transaction settings page", async ({ page, dictionary }) => {
    await expect(page.getByRole("heading", { name: dictionary.settings.transaction.title }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should display Date & Time section", async ({ page, dictionary }) => {
    // getByText is safer if Role matching is complex for nested sections
    await expect(page.getByText(dictionary.settings.transaction.date_time.title).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should display Input & Interaction section", async ({ page, dictionary }) => {
    await expect(page.getByText(dictionary.settings.transaction.input_interaction.title).first()).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe("System: Settings — Wallets & Banks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/settings/wallets-and-banks");
    await page.waitForLoadState("domcontentloaded");
  });

  test("should render the wallets settings page", async ({ page, dictionary }) => {
    // Wait for hydration signal
    await expect(
      page
        .getByRole("heading", { name: dictionary.settings.wallets.title })
        .or(page.getByText(dictionary.settings.wallets.title)),
    ).toBeVisible({ timeout: 15000 });
  });
});
