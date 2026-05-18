import { expect, setup } from "./fixtures";
import path from "node:path";

const authFile = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page, dictionary }) => {
  setup.setTimeout(120000); // 2 minutes for auth setup

  // Hide Next.js dev overlay to prevent it from blocking clicks
  await page.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.innerHTML = `
        nextjs-portal { display: none !important; }
        .nextjs-toast-errors-parent { display: none !important; }
      `;
      document.head.appendChild(style);
    });
  });

  await page.goto("/en/login");

  if (process.env.PLAYWRIGHT_MANUAL_AUTH) {
    // Manual mode for Social Login (Google/GitHub)
    console.log("--- MANUAL AUTHENTICATION MODE ---");
    console.log("Please log in manually in the browser window.");
    console.log("Playwright will capture the session once you reach the dashboard.");

    // Wait for the URL to contain 'overview' with no timeout
    await page.waitForURL(/.*overview/, { timeout: 0 });
  } else {
    // Automated mode for Email/Password (fallback)
    const email = process.env.PLAYWRIGHT_USER;
    const password = process.env.PLAYWRIGHT_PASS;

    if (!email || !password) {
      console.log("\n⚠️  PLAYWRIGHT_USER and PLAYWRIGHT_PASS not set.");
      console.log("\n📝 To set up authentication:");
      console.log("   1. Run: bun run test:e2e:login");
      console.log("   2. Log in manually in the browser");
      console.log("   3. Your session will be saved for future tests\n");

      // Skip tests gracefully
      setup.skip();
      return;
    }

    // Use dictionary for strings that might change
    console.log("Attempting to expand login form options...");
    await page.getByText(dictionary.auth.show_other_options).click();
    console.log("Login form options expanded.");

    await page.getByLabel(dictionary.auth.form.email_label).fill(email);
    await page.getByLabel(dictionary.auth.form.password_label).fill(password);
    await page.getByRole("button", { name: dictionary.auth.form.login_button, exact: true }).click();

    // Wait for redirect - could be overview or create-workspace
    await page.waitForURL(/\/(overview|create-workspace)/, { timeout: 30000 });

    // If redirected to create-workspace, provide instructions
    if (page.url().includes('create-workspace')) {
      console.log("\n⚠️  First-time user detected - workspace needs to be created.");
      console.log("\n📝 Please run manual setup:");
      console.log("   bun run test:e2e:login");
      console.log("   Then complete workspace creation in the browser.\n");

      // Try to create workspace automatically if possible
      try {
        console.log("Attempting automatic workspace creation...");
        await page.waitForLoadState('networkidle');

        // Step 1: Fill business details
        const nameInput = page.getByLabel(/Company name/i);
        await nameInput.waitFor({ state: 'visible', timeout: 3000 });
        await nameInput.fill('E2E Test Workspace');
        
        // Click Continue
        const continueBtn = page.getByRole('button', { name: /Continue/i });
        await continueBtn.click();

        // Step 2: Create Workspace (Free Plan)
        const createBtn = page.getByRole('button', { name: /Create workspace/i });
        await createBtn.waitFor({ state: 'visible', timeout: 5000 });
        await createBtn.click();

        await page.waitForURL(/.*overview/, { timeout: 20000 });
        console.log("✅ Workspace created automatically!");
      } catch (error) {
        console.log("❌ Could not create workspace automatically.");
        console.log("   Please run: bun run test:e2e:login");
        setup.skip();
        return;
      }
    }

    // Verify we're on the overview page
    await expect(page).toHaveURL(/.*overview/, { timeout: 5000 });
  }

  // End of authentication steps.
  await page.context().storageState({ path: authFile });
  console.log("✅ Authentication saved to:", authFile);
});
