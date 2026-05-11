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
      console.warn("Skipping automated login: PLAYWRIGHT_USER or PLAYWRIGHT_PASS not set.");
      console.warn('Run "bun run test:e2e:login" to authenticate manually.');
      return;
    }

    // Use dictionary for strings that might change
    console.log("Attempting to expand login form options...");
    await page.getByText(dictionary.auth.show_other_options).click();
    console.log("Login form options expanded.");

    await page.getByLabel(dictionary.auth.form.email_label).fill(email);
    await page.getByLabel(dictionary.auth.form.password_label).fill(password);
    await page.getByRole("button", { name: dictionary.auth.form.login_button, exact: true }).click();

    // Wait for redirect to dashboard with a longer timeout
    await expect(page).toHaveURL(/.*overview/, { timeout: 30000 });
  }

  // End of authentication steps.
  await page.context().storageState({ path: authFile });
});
