import type { Elysia } from "elysia";
import { encrypt } from "@workspace/encryption";
import { Env } from "@workspace/constants";

/**
 * Encryption plugin — encrypts ALL JSON responses with AES-256-GCM.
 *
 * Responses are expected to already conform to ApiResponse<T> shape
 * (built by controllers using @workspace/utils helpers).
 *
 * Flow: ApiResponse<T> → JSON.stringify → AES encrypt → { data: encrypted_string }
 */
export const encryptionPlugin = (app: Elysia) =>
  app.mapResponse(({ response, set: _set, path }) => {
    if (path && path.startsWith("/swagger")) return;

    // Only encrypt JSON responses
    if (
      response &&
      typeof response === "object" &&
      !(response instanceof Blob) &&
      !(response instanceof ReadableStream) &&
      !(response instanceof Response)
    ) {
      const secret = Env.ENCRYPTION_KEY;

      if (!secret) {
        return;
      }

      try {
        const encrypted = encrypt(JSON.stringify(response), secret);
        return new Response(JSON.stringify({ data: encrypted }), {
          headers: {
            "Content-Type": "application/json",
            "x-encrypted": "true",
          },
        });
      } catch (error) {
        console.error("Encryption failed:", error);
        return;
      }
    }
  });
