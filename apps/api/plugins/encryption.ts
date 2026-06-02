import { Env } from "@workspace/constants";
import { decrypt, encrypt } from "@workspace/encryption";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import type { Elysia } from "elysia";

import { appendFileSync } from "fs";

/**
 * Encryption plugin — symmetric encryption for production.
 * 1. Decrypts request bodies if 'x-encrypted' header is present.
 * 2. Encrypts all JSON responses with AES-256-GCM.
 */
export const encryptionPlugin = (app: Elysia) =>
  app
    .onTransform(async ({ request, body, path }) => {
      const isEncryptedHeader = request.headers.get("x-encrypted") === "true";
      const contentType = request.headers.get("content-type") || "";

      if (
        contentType.includes("application/json") &&
        isEncryptedHeader &&
        body &&
        typeof body === "object" &&
        "data" in body
      ) {
        console.log(
          `[Encryption] onTransform: path=${path}, decrypting body...`,
        );
        const secret = Env.ENCRYPTION_KEY;
        if (!secret) {
          console.error("[Encryption] ENCRYPTION_KEY missing in Env");
          return;
        }

        try {
          const decrypted = decrypt((body as any).data, secret);
          const parsed = JSON.parse(decrypted);

          // Mutate the body object for subsequent handlers and validation
          Object.keys(body).forEach((key) => { delete (body as any)[key]; });
          Object.assign(body, parsed);
        } catch (error: any) {
          console.error(`[Encryption] Decrypt failed for ${path}:`, error);
        }
      }
    })
    .mapResponse(({ response, set: _set, path }) => {
      if (
        path &&
        (path.startsWith("/swagger") ||
          path.startsWith("/health") ||
          path.includes("/mayar/webhook"))
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
          console.error("Encryption failed:", error);
          return;
        }
      }
    });
