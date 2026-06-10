import { defineConfig } from "@playwright/test";
import { baseConfig } from "@workspace/playwright";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig(baseConfig, {
  /* Base URL to use in actions like `await page.goto('/')`. */
  use: {
    baseURL: process.env.NEXT_PUBLIC_ADMIN_URL || "http://127.0.0.1:3001",
  },

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "bun run build && bun run start",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
