import { defineConfig, devices } from "@playwright/test";
import { baseConfig } from "@workspace/playwright";
import { loadEnv } from "@workspace/utils/load-env";

import path from "node:path";

// Load environment variables from .env file
loadEnv();

export const STORAGE_STATE = path.join(__dirname, ".auth/user.json");

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig(baseConfig, {
  /* Base URL to use in actions like `await page.goto('/')`. */
  timeout: 120 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000",
    actionTimeout: 30 * 1000,
    navigationTimeout: 90 * 1000,
  },
  workers: 1,

  projects: [
    // Setup project
    { name: "setup", testMatch: /.*\.setup\.ts/ },

    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use prepared auth state.
        storageState: STORAGE_STATE,
      },
      dependencies: ["setup"],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    // Use the dev server locally — avoids `next build` which fails due to
    // /_global-error prerender when client components use React context.
    // In CI, set USE_BUILD=true to use the production build instead.
    command: process.env.USE_BUILD
      ? "PORT=3000 ~/.bun/bin/bun run build && PORT=3000 ~/.bun/bin/bun run start"
      : "PORT=3000 ~/.bun/bin/bun run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
