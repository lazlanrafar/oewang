import { expect, test } from "bun:test";
import { resolve } from "node:path";

// Other suites install global database/module mocks; keep this SQL contract isolated.
test("should pass private-session contracts when isolated from global module mocks", () => {
  const result = Bun.spawnSync(
    [process.execPath, "test", "./test/unit/ai-session-privacy.test.ts"],
    {
      cwd: resolve(__dirname, "../../.."),
      env: { ...process.env, DATABASE_URL: "postgres://localhost/oewang_test" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
});
