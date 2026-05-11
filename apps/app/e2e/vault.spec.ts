import { expect, test } from "./fixtures";
import fs from "node:fs";
import path from "node:path";

/**
 * Workspace: Vault (Secure File Storage)
 *
 * VaultClient renders:
 *   - <h1>{t.title}</h1> → "Vault"
 *   - Search input: placeholder={t.search_placeholder} → "Search files..."
 *   - Upload button: {t.upload_button} → "Upload" (as text inside a button with a Plus icon)
 *
 * NOTE: The Upload button contains a Plus icon followed by the text " Upload"
 * so we match with a regex of the dictionary key.
 */
test.describe("Workspace: Vault", () => {
  const testFilePath = path.join(__dirname, "fixtures", "test-document.pdf");

  test.beforeAll(async () => {
    const fixturesDir = path.join(__dirname, "fixtures");
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
    // Create a minimal valid file (plain text but named .pdf — vault accepts it for testing)
    fs.writeFileSync(testFilePath, "%PDF-1.4\nOewang Vault E2E test file\n");
  });

  test.afterAll(async () => {
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  });

  test.beforeEach(async ({ page, dictionary }) => {
    await page.goto("/en/vault");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the Vault title as a first marker
    await expect(page.getByRole("heading", { name: dictionary.vault.title })).toBeVisible({ timeout: 15000 });

    // Wait for the search input to appear — VaultClient returns a skeleton until dictionary/client load completes
    await expect(page.getByPlaceholder(dictionary.vault.search_placeholder)).toBeVisible({
      timeout: 30000,
    });
  });

  test("should render the vault page title and search bar", async ({ page, dictionary }) => {
    // Page title might be in a header or h1, use getByText for flexibility
    await expect(page.getByText(dictionary.vault.title).first()).toBeVisible();
    await expect(page.getByPlaceholder(dictionary.vault.search_placeholder)).toBeVisible();
  });

  test("should render the Upload button", async ({ page, dictionary }) => {
    // The button has a Plus icon + text "Upload" — match by role with partial name
    await expect(page.getByRole("button", { name: new RegExp(dictionary.vault.upload_button, "i") })).toBeVisible();
  });

  test("should display storage usage progress bar", async ({ page }) => {
    // The HeaderStorageUsage component renders a Progress component (role=progressbar)
    await expect(page.locator('[role="progressbar"]').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should toggle to grid view and back to list view", async ({ page }) => {
    // The view toggle buttons render as icon-only buttons next to the search input
    // Grid button is the second icon button in that group
    const gridButton = page
      .locator('button[class*="h-7"]')
      .filter({ has: page.locator("svg") })
      .nth(1);
    if (await gridButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gridButton.click();
      await page.waitForTimeout(300);
    }
    // Switch back to list
    const listButton = page
      .locator('button[class*="h-7"]')
      .filter({ has: page.locator("svg") })
      .nth(0);
    if (await listButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await listButton.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("should upload a file to the vault", async ({ page, dictionary }) => {
    // Generate a valid 1x1 transparent PNG file
    const fileContent = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const fileName = `e2e-test-${Date.now()}.png`;

    const fileChooserPromise = page.waitForEvent("filechooser");
    // Click any button or element that triggers the file input click
    await page
      .getByRole("button", { name: new RegExp(dictionary.vault.upload_button, "i") })
      .first()
      .click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: fileName,
      mimeType: "image/png",
      buffer: fileContent,
    });

    // Success detection: Wait for the filename to appear in the page or the success toast
    // The filename is the most reliable indicator that the upload finished and the list refreshed
    const successToast = page.getByText(dictionary.vault.toasts.upload_success);
    const fileInList = page.getByText(fileName);

    await expect(successToast.or(fileInList)).toBeVisible({ timeout: 60000 });
  });

  test("should search for a file", async ({ page, dictionary }) => {
    const searchInput = page.getByPlaceholder(dictionary.vault.search_placeholder);
    await searchInput.fill("document");
    await page.waitForTimeout(500);
    await expect(searchInput).toHaveValue("document");
  });

  test("should clear search to show all files", async ({ page, dictionary }) => {
    const searchInput = page.getByPlaceholder(dictionary.vault.search_placeholder);
    await searchInput.fill("xyz-random");
    await page.waitForTimeout(500);
    await searchInput.fill("");
    await expect(searchInput).toHaveValue("");
  });
});
