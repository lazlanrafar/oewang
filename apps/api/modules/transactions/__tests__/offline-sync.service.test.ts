import { expect, test } from "bun:test";
import { resolve } from "node:path";

// Existing suites replace service modules globally with partial mocks. Run
// these cross-module contracts in a fresh process so they exercise real services.
test("should pass offline service contracts when isolated from global module mocks", () => {
  const result = Bun.spawnSync(
    [process.execPath, "test", "./test/unit/offline-sync.service.test.ts"],
    {
      cwd: resolve(__dirname, "../../.."),
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
});
