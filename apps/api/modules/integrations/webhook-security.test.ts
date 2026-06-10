import { describe, expect, test } from "bun:test";
import { verifyTelegramSecret } from "./webhook-security";

describe("verifyTelegramSecret", () => {
  test("returns true when secrets match", () => {
    expect(
      verifyTelegramSecret({
        expectedSecret: "my-secret-token",
        receivedSecret: "my-secret-token",
      }),
    ).toBe(true);
  });

  test("returns false when secrets don't match", () => {
    expect(
      verifyTelegramSecret({
        expectedSecret: "correct-secret",
        receivedSecret: "wrong-secret",
      }),
    ).toBe(false);
  });

  test("returns false when received secret is null", () => {
    expect(
      verifyTelegramSecret({ expectedSecret: "my-secret", receivedSecret: null }),
    ).toBe(false);
  });

  test("returns false for empty string received secret", () => {
    expect(
      verifyTelegramSecret({ expectedSecret: "my-secret", receivedSecret: "" }),
    ).toBe(false);
  });
});
