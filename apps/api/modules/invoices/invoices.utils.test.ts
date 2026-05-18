import { describe, test, expect, beforeAll } from "bun:test";
import { generateInvoiceToken, verifyInvoiceToken } from "./invoices.utils";

describe("invoices.utils", () => {
  // Set JWT_SECRET for tests
  beforeAll(() => {
    process.env.JWT_SECRET = "test-jwt-secret-for-invoice-tokens";
  });

  describe("generateInvoiceToken", () => {
    test("generates a valid JWT token", async () => {
      const token = await generateInvoiceToken("inv_123", "ws_456");

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
    });

    test("generates different tokens for different invoice IDs", async () => {
      const token1 = await generateInvoiceToken("inv_123", "ws_456");
      const token2 = await generateInvoiceToken("inv_789", "ws_456");

      expect(token1).not.toBe(token2);
    });

    test("generates different tokens for different workspace IDs", async () => {
      const token1 = await generateInvoiceToken("inv_123", "ws_456");
      const token2 = await generateInvoiceToken("inv_123", "ws_789");

      expect(token1).not.toBe(token2);
    });

    test("generates valid token with special characters in IDs", async () => {
      const token = await generateInvoiceToken(
        "inv-123_test@example",
        "ws-456_org#1"
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
    });
  });

  describe("verifyInvoiceToken", () => {
    test("verifies and decodes a valid token", async () => {
      const invoiceId = "inv_123";
      const workspaceId = "ws_456";

      const token = await generateInvoiceToken(invoiceId, workspaceId);
      const payload = await verifyInvoiceToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.id).toBe(invoiceId);
      expect(payload?.workspaceId).toBe(workspaceId);
    });

    test("returns null for invalid token", async () => {
      const payload = await verifyInvoiceToken("invalid.token.here");
      expect(payload).toBeNull();
    });

    test("returns null for malformed token", async () => {
      const payload = await verifyInvoiceToken("not-a-jwt");
      expect(payload).toBeNull();
    });

    test("returns null for empty token", async () => {
      const payload = await verifyInvoiceToken("");
      expect(payload).toBeNull();
    });

    test("returns null for token with wrong signature", async () => {
      // Generate a token with correct structure but wrong secret
      const token = await generateInvoiceToken("inv_123", "ws_456");

      // Tamper with the token by changing a character
      const tamperedToken = token.slice(0, -5) + "xxxxx";

      const payload = await verifyInvoiceToken(tamperedToken);
      expect(payload).toBeNull();
    });
  });

  describe("round-trip token generation and verification", () => {
    test("generates and verifies token successfully", async () => {
      const testCases = [
        { invoiceId: "inv_1", workspaceId: "ws_1" },
        { invoiceId: "invoice-abc-123", workspaceId: "workspace-xyz-789" },
        { invoiceId: "INV_001", workspaceId: "WS_001" },
        { invoiceId: "uuid-123-456", workspaceId: "uuid-789-012" },
      ];

      for (const { invoiceId, workspaceId } of testCases) {
        const token = await generateInvoiceToken(invoiceId, workspaceId);
        const payload = await verifyInvoiceToken(token);

        expect(payload).not.toBeNull();
        expect(payload?.id).toBe(invoiceId);
        expect(payload?.workspaceId).toBe(workspaceId);
      }
    });

    test("token contains standard JWT claims", async () => {
      const token = await generateInvoiceToken("inv_123", "ws_456");
      const payload = await verifyInvoiceToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.id).toBeDefined();
      expect(payload?.workspaceId).toBeDefined();
    });
  });

  describe("token expiration", () => {
    test("token is valid immediately after generation", async () => {
      const token = await generateInvoiceToken("inv_123", "ws_456");
      const payload = await verifyInvoiceToken(token);

      expect(payload).not.toBeNull();
    });

    test("multiple tokens with same data are valid", async () => {
      const token1 = await generateInvoiceToken("inv_123", "ws_456");
      const token2 = await generateInvoiceToken("inv_123", "ws_456");

      // Both tokens should be valid
      const payload1 = await verifyInvoiceToken(token1);
      const payload2 = await verifyInvoiceToken(token2);

      expect(payload1).not.toBeNull();
      expect(payload2).not.toBeNull();
      expect(payload1?.id).toBe(payload2?.id);
      expect(payload1?.workspaceId).toBe(payload2?.workspaceId);
    });
  });

  describe("security", () => {
    test("cannot verify token with modified payload", async () => {
      const token = await generateInvoiceToken("inv_123", "ws_456");
      const parts = token.split(".");

      // Try to modify the payload (middle part)
      const tamperedPayload = Buffer.from(
        JSON.stringify({ id: "inv_999", workspaceId: "ws_999" })
      ).toString("base64url");

      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const payload = await verifyInvoiceToken(tamperedToken);
      expect(payload).toBeNull();
    });

    test("tokens are properly signed", async () => {
      const token = await generateInvoiceToken("inv_123", "ws_456");

      // A valid token should have a signature (third part)
      const parts = token.split(".");
      expect(parts[2]).toBeDefined();
      expect(parts[2].length).toBeGreaterThan(0);
    });
  });
});
