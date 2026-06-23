import { describe, expect, test } from "bun:test";
import {
  verifyEvolutionApiKey,
  verifyTelegramSecret,
} from "./webhook-security";

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
      verifyTelegramSecret({
        expectedSecret: "my-secret",
        receivedSecret: null,
      }),
    ).toBe(false);
  });

  test("returns false for empty string received secret", () => {
    expect(
      verifyTelegramSecret({ expectedSecret: "my-secret", receivedSecret: "" }),
    ).toBe(false);
  });
});

describe("verifyEvolutionApiKey", () => {
  test("returns true when the apikey matches the configured token", () => {
    expect(
      verifyEvolutionApiKey({
        expectedToken: "evolution-instance-key",
        receivedToken: "evolution-instance-key",
      }),
    ).toBe(true);
  });

  test("returns false when the apikey does not match", () => {
    expect(
      verifyEvolutionApiKey({
        expectedToken: "evolution-instance-key",
        receivedToken: "forged-key",
      }),
    ).toBe(false);
  });

  test("returns false when no token is provided (null/undefined/empty)", () => {
    expect(
      verifyEvolutionApiKey({
        expectedToken: "evolution-instance-key",
        receivedToken: null,
      }),
    ).toBe(false);
    expect(
      verifyEvolutionApiKey({
        expectedToken: "evolution-instance-key",
        receivedToken: undefined,
      }),
    ).toBe(false);
    expect(
      verifyEvolutionApiKey({
        expectedToken: "evolution-instance-key",
        receivedToken: "",
      }),
    ).toBe(false);
  });

  test("returns false when lengths differ (no partial/prefix match)", () => {
    expect(
      verifyEvolutionApiKey({
        expectedToken: "evolution-instance-key",
        receivedToken: "evolution",
      }),
    ).toBe(false);
  });
});
