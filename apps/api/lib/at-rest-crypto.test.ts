// Distinct transport vs data keys BEFORE the module (and its lazy Env) resolve.
// Top-level runs before any test body, so Env caches these values.
process.env.ENCRYPTION_KEY = "a".repeat(32);
process.env.DATA_ENCRYPTION_KEY = "b".repeat(32);

import { describe, expect, it } from "bun:test";
import { encrypt } from "@workspace/encryption";
import { decryptAtRest, encryptAtRest } from "./at-rest-crypto";

describe("at-rest-crypto", () => {
  it("should round-trip data with the data key when configured", () => {
    const ciphertext = encryptAtRest("oauth-token");
    expect(decryptAtRest(ciphertext)).toBe("oauth-token");
  });

  it("should decrypt legacy rows written with the transport key when the data key fails", () => {
    // A row encrypted before the split — with ENCRYPTION_KEY, not the data key.
    const legacy = encrypt("legacy-token", "a".repeat(32));
    expect(decryptAtRest(legacy)).toBe("legacy-token");
  });
});
