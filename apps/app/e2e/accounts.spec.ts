import { expect, test } from "./fixtures";

test.describe("Finance: Accounts", () => {
  const testAccountName = `E2E Account ${Date.now()}`;

  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/accounts", { timeout: 90000 });
    await page.waitForLoadState("domcontentloaded");
    // Wait for the client component to hydrate
    await expect(page.getByRole("button", { name: dictionary.accounts.add_account })).toBeVisible({ timeout: 15000 });
  });

  test("should render the accounts page with header buttons", async ({ page, dictionary }) => {
    await expect(page.getByRole("button", { name: dictionary.accounts.add_account })).toBeVisible();
  });

  test('should open the Add Account sheet when clicking "Add Account"', async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.accounts.add_account }).click();

    // The sheet slides in — wait for form placeholder text
    await expect(page.getByPlaceholder(dictionary.accounts.account_name_placeholder)).toBeVisible({ timeout: 5000 });
  });

  test("should show validation error when submitting empty account form", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.accounts.add_account }).click();
    await expect(page.getByPlaceholder(dictionary.accounts.account_name_placeholder)).toBeVisible({ timeout: 5000 });

    // Click submit without filling anything
    await page.getByRole("button", { name: dictionary.accounts.create_account }).click();

    // Name validation error - wait for it to appear (using regex for robustness)
    await expect(page.getByText(/Name is required/i)).toBeVisible({ timeout: 15000 });
  });

  test("should create a new account successfully", async ({ page, dictionary }) => {
    await page.getByRole("button", { name: dictionary.accounts.add_account }).click();

    const nameInput = page.getByPlaceholder(dictionary.accounts.account_name_placeholder);
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(testAccountName);

    // Submit form
    await page.getByRole("button", { name: dictionary.accounts.create_account }).click();

    // Expect a success toast
    await expect(page.getByText(dictionary.accounts.toasts.created)).toBeVisible({ timeout: 15000 });
  });

  test("should search for accounts using the search field", async ({ page, dictionary }) => {
    const searchInput = page.getByPlaceholder(dictionary.accounts.search_placeholder);
    await searchInput.fill("savings");
    await page.waitForTimeout(600); // debounce
    await expect(searchInput).toHaveValue("savings");
  });
});
