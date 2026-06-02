/**
 * Global test setup
 * This file runs before all tests
 */

import { afterAll, beforeAll } from "bun:test";
import { loadEnv } from "@workspace/utils/load-env";

// Load test environment variables
loadEnv(".env.test");

// Ensure we're in test mode
if (process.env.NODE_ENV !== "test") {
  process.env.NODE_ENV = "test";
}

beforeAll(() => {
  console.log("🧪 Test suite starting...");
  console.log(`   Database: ${process.env.DATABASE_URL}`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
});

afterAll(() => {
  console.log("✅ Test suite completed");
});
