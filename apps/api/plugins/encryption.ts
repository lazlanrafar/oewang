import { Env } from "@workspace/constants";
import { decrypt, encrypt } from "@workspace/encryption";
import { createLogger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import type { Elysia } from "elysia";

import { appendFileSync } from "fs";

const log = createLogger("encryption");

/**
 * Encryption plugin — symmetric encryption for production.
 * 1. Decrypts request bodies if 'x-encrypted' header is present.
 * 2. Encrypts all JSON responses with AES-256-GCM.
 */
export const encryptionPlugin = (app: Elysia) =>
  app
    .onTransform(async (context) => {
      const { request, body, path } = context;
      const isEncryptedHeader = request.headers.get("x-encrypted") === "true";
      const contentType = request.headers.get("content-type") || "";

      if (
        contentType.includes("application/json") &&
        isEncryptedHeader &&
        body &&
        typeof body === "object" &&
        "data" in body
      ) {
        log.debug("Decrypting request body", { path });
        const secret = Env.ENCRYPTION_KEY;
        if (!secret) {
          log.error("ENCRYPTION_KEY missing");
          return;
        }

        try {
          const decrypted = decrypt((body as any).data, secret);
          const parsed = JSON.parse(decrypted);

          // Replace the body on the context outright — routes whose schema
          // is a top-level array (e.g. bulkCreate) need `context.body` to
          // literally BE that array. The previous approach (clear body's
          // keys, then Object.assign(body, parsed)) only worked for object
          // payloads: Object.assign onto a plain object copies an array's
          // enumerable indices but not its non-enumerable `length`, leaving
          // an array-like `{0:..,1:..,length missing}` that fails
          // `Array.isArray` — every array-bodied endpoint saw a bogus
          // "Expected object"/"Expected array" validation error regardless
          // of how well-formed the decrypted rows actually were.
          (context as { body: unknown }).body = parsed;
        } catch (error: any) {
          log.error("Decrypt failed", { path, error });
        }
      }
    })
    .mapResponse(({ response, set: _set, path }) => {
      if (
        path &&
        (path.startsWith("/swagger") ||
          path.startsWith("/health") ||
          path.startsWith("/mcp") ||
          path.startsWith("/.well-known") ||
          path.startsWith("/oauth") ||
          // Public marketing endpoint — plaintext JSON so the website (and any
          // external consumer) can read it with a plain fetch, no shared key.
          path.includes("/public/pricing") ||
          path.includes("/mayar/webhook") ||
          path.includes("/integrations/telegram/webhook") ||
          // Internal sidecar surface (Python AI service) — plain JSON, gated by
          // the shared AI_SERVICE_API_KEY, not the encrypted client transport.
          path.includes("/ai/internal"))
      )
        return;

      // Only encrypt JSON responses
      if (
        response &&
        typeof response === "object" &&
        !(response instanceof Blob) &&
        !(response instanceof ReadableStream) &&
        !(response instanceof Response) &&
        !("_is_encrypted" in (response as any)) // Prevent double encryption
      ) {
        const secret = Env.ENCRYPTION_KEY;

        if (!secret) {
          return;
        }

        try {
          const encrypted = encrypt(JSON.stringify(response), secret);
          // Mark as encrypted to prevent double encryption in nested .use()
          const _result = { data: encrypted, _is_encrypted: true };

          return new Response(JSON.stringify({ data: encrypted }), {
            status: typeof _set.status === "number" ? _set.status : 200,
            headers: {
              ...(_set.headers as Record<string, string>),
              "Content-Type": "application/json",
              "x-encrypted": "true",
            },
          });
        } catch (error) {
          log.error("Encryption failed", { error });
          return;
        }
      }
    });
