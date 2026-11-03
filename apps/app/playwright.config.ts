import { defineConfig, devices } from '@playwright/test';

/**
 * The journey tests (US-038).
 *
 * Three journeys and an accessibility pass, run against a stack that is
 * already up: the app on 3000, the API on 3002, the AI service on 3004,
 * PostgreSQL and MinIO behind them. Playwright starts nothing, because
 * starting half a stack is how a suite ends up testing a different system
 * from the one that ships.
 *
 * The seeded demo workspace is the fixture
 * (`apps/api/seeds/dev.sql`). Every test signs in as that user, and each
 * one creates what it needs rather than depending on what another left
 * behind: a suite whose tests have to run in order is a suite that cannot
 * be run in parallel or alone.
 */

/** Where the app is. The CI job sets this if it runs the stack elsewhere. */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
	testDir: './e2e',
	// Each file gets a worker; the specs create their own rows, so they do
	// not collide. Serial in CI, where a shared stack is the bottleneck.
	fullyParallel: !process.env.CI,
	workers: process.env.CI ? 1 : undefined,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
	timeout: 30_000,
	expect: { timeout: 10_000 },

	use: {
		baseURL: BASE_URL,
		// A failed journey is worth more than a passed one, so keep what
		// explains it and nothing that does not.
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off'
	},

	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
