import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Env } from "@workspace/constants";
import {
  and,
  db,
  eq,
  gt,
  mcp_auth_codes,
  mcp_oauth_clients,
  mcp_tokens,
} from "@workspace/database";
import { createLogger } from "@workspace/logger";
import { Elysia } from "elysia";
import { randomBytes, createHash } from "crypto";
import * as jose from "jose";
import { createMcpServer } from "./mcp-server";

const log = createLogger("mcp");

const apiUrl = () =>
  Env.API_BASE_URL ?? `http://localhost:${Env.API_PORT ?? 3002}`;
const appUrl = () => Env.APP_URL ?? "http://localhost:3000";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function verifyPkce(verifier: string, challenge: string): boolean {
  const hash = createHash("sha256").update(verifier).digest("base64url");
  return hash === challenge;
}

async function validateBearerToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const row = await db.query.mcp_tokens.findFirst({
    where: and(
      eq(mcp_tokens.token, token),
      eq(mcp_tokens.revoked, false),
      gt(mcp_tokens.expires_at, new Date()),
    ),
  });

  return row ?? null;
}

// ── MCP controller (no encryptionPlugin — these routes are excluded in encryption.ts) ──

export const mcpController = new Elysia()

  // ── OAuth discovery ──────────────────────────────────────────────────────────────────

  .get("/.well-known/oauth-protected-resource", ({ set }) => {
    set.headers["Content-Type"] = "application/json";
    return { resource: apiUrl(), authorization_servers: [apiUrl()] };
  })

  // RFC 9728: clients may append a path suffix (e.g. /.well-known/oauth-protected-resource/mcp)
  .get("/.well-known/oauth-protected-resource/*", ({ set }) => {
    set.headers["Content-Type"] = "application/json";
    return { resource: apiUrl(), authorization_servers: [apiUrl()] };
  })

  .get("/.well-known/oauth-authorization-server", ({ set }) => {
    set.headers["Content-Type"] = "application/json";
    return {
      issuer: apiUrl(),
      authorization_endpoint: `${appUrl()}/oauth/authorize`,
      token_endpoint: `${apiUrl()}/oauth/token`,
      registration_endpoint: `${apiUrl()}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    };
  })

  // ── Dynamic Client Registration ──────────────────────────────────────────────────────

  .post("/oauth/register", async ({ body, set }) => {
    const { client_name, redirect_uris } = body as any;

    if (
      !client_name ||
      !Array.isArray(redirect_uris) ||
      redirect_uris.length === 0
    ) {
      set.status = 400;
      return {
        error: "invalid_request",
        error_description: "client_name and redirect_uris are required",
      };
    }

    const clientId = `oewang_${randomBytes(12).toString("hex")}`;

    await db.insert(mcp_oauth_clients).values({
      client_id: clientId,
      client_name: String(client_name),
      redirect_uris: redirect_uris.map(String),
    });

    return {
      client_id: clientId,
      client_name,
      redirect_uris,
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "none",
      response_types: ["code"],
    };
  })

  // ── Client lookup (for consent page to display app name) ────────────────────────────

  .get("/oauth/client/:client_id", async ({ params, set }) => {
    const client = await db.query.mcp_oauth_clients.findFirst({
      where: eq(mcp_oauth_clients.client_id, params.client_id),
    });

    if (!client) {
      set.status = 404;
      return { error: "not_found" };
    }

    return { client_id: client.client_id, client_name: client.client_name };
  })

  // ── Create auth code (called by the Next.js consent page after user approves) ─────────

  .post("/oauth/code", async ({ set, body: rawBody, headers }) => {
    // Verify the caller is a logged-in app user (Bearer = app JWT)
    const authHeader =
      (headers as any).authorization ?? (headers as any).Authorization ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      set.status = 401;
      return { error: "unauthorized" };
    }

    const jwtToken = authHeader.slice(7);
    let payload: jose.JWTPayload;
    try {
      const secret = new TextEncoder().encode(Env.JWT_SECRET!);
      const result = await jose.jwtVerify(jwtToken, secret);
      payload = result.payload;
    } catch {
      set.status = 401;
      return { error: "invalid_token" };
    }

    const user_id = payload.user_id as string | undefined;
    const workspace_id = (payload.workspace_id ?? payload.workspaceId) as
      | string
      | undefined;
    if (!user_id || !workspace_id) {
      set.status = 401;
      return { error: "invalid_token" };
    }

    const body = (rawBody as any) ?? {};
    const { client_id, redirect_uri, code_challenge } = body;

    if (!client_id || !redirect_uri) {
      set.status = 400;
      return { error: "invalid_request" };
    }

    const code = generateToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      await db.insert(mcp_auth_codes).values({
        code,
        client_id,
        user_id,
        workspace_id,
        redirect_uri,
        code_challenge: code_challenge ?? null,
        expires_at: expiresAt,
      });
    } catch (err) {
      log.error("Failed to insert mcp_auth_code", { err, client_id, user_id });
      set.status = 500;
      return { error: "server_error" };
    }

    return { code };
  })

  // ── Token exchange ───────────────────────────────────────────────────────────────────

  .post("/oauth/token", async ({ set, body: rawBody }) => {
    // Elysia parses both application/json and application/x-www-form-urlencoded into `body`
    const body = ((rawBody as any) ?? {}) as Record<string, string>;

    const { grant_type, code, redirect_uri, client_id, code_verifier } = body;

    if (grant_type !== "authorization_code") {
      set.status = 400;
      return {
        error: "unsupported_grant_type",
        error_description: "Only authorization_code is supported",
      };
    }

    if (!code || !client_id) {
      set.status = 400;
      return {
        error: "invalid_request",
        error_description: "code and client_id are required",
      };
    }

    const authCode = await db.query.mcp_auth_codes.findFirst({
      where: and(
        eq(mcp_auth_codes.code, code),
        eq(mcp_auth_codes.client_id, client_id),
        eq(mcp_auth_codes.used, false),
        gt(mcp_auth_codes.expires_at, new Date()),
      ),
    });

    if (!authCode) {
      set.status = 400;
      return {
        error: "invalid_grant",
        error_description: "Authorization code is invalid or expired",
      };
    }

    if (redirect_uri && authCode.redirect_uri !== redirect_uri) {
      set.status = 400;
      return {
        error: "invalid_grant",
        error_description: "redirect_uri mismatch",
      };
    }

    if (authCode.code_challenge) {
      if (!code_verifier) {
        set.status = 400;
        return {
          error: "invalid_request",
          error_description: "code_verifier required",
        };
      }
      if (!verifyPkce(code_verifier, authCode.code_challenge)) {
        set.status = 400;
        return {
          error: "invalid_grant",
          error_description: "PKCE verification failed",
        };
      }
    }

    // Mark code as used
    await db
      .update(mcp_auth_codes)
      .set({ used: true })
      .where(eq(mcp_auth_codes.id, authCode.id));

    const accessToken = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.insert(mcp_tokens).values({
      token: accessToken,
      client_id,
      user_id: authCode.user_id,
      workspace_id: authCode.workspace_id,
      expires_at: expiresAt,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 30 * 24 * 60 * 60,
      scope: "read write",
    };
  })

  // ── HTTP MCP endpoint ─────────────────────────────────────────────────────────────────

  .all("/mcp", async ({ request, set, headers, body: elysiaBody }) => {
    const tokenRow = await validateBearerToken(
      (headers as any).authorization ?? null,
    );

    if (!tokenRow) {
      return new Response(
        JSON.stringify({
          error: "unauthorized",
          error_description:
            "Bearer token required. Use OAuth to authenticate.",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer resource_metadata="${apiUrl()}/.well-known/oauth-protected-resource"`,
          },
        },
      );
    }

    log.info("MCP request", {
      user_id: tokenRow.user_id,
      workspace_id: tokenRow.workspace_id,
    });

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });

    const server = createMcpServer(tokenRow.workspace_id, tokenRow.user_id);
    await server.connect(transport);

    // Elysia consumes the body stream before the handler runs.
    // Reconstruct the Request with the re-serialized body so the MCP transport can read it.
    let mcpRequest = request;
    if (request.method === "POST" && elysiaBody != null) {
      mcpRequest = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body:
          typeof elysiaBody === "string"
            ? elysiaBody
            : JSON.stringify(elysiaBody),
      });
    }

    return transport.handleRequest(mcpRequest);
  });
