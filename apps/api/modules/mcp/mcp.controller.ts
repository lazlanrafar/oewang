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
  users,
} from "@workspace/database";
import { createLogger } from "@workspace/logger";
import { Elysia } from "elysia";
import { randomBytes, createHash } from "crypto";
import * as jose from "jose";
import { getAuth } from "../../plugins/auth";
import { createMcpServer } from "./mcp-server";

const log = createLogger("mcp");

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function oauthHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Oewang — Authorize</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08); padding: 40px 36px; width: 100%; max-width: 400px; }
  .logo { font-size: 22px; font-weight: 700; margin-bottom: 24px; letter-spacing: -.5px; }
  .title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
  .subtitle { font-size: 14px; color: #666; margin-bottom: 24px; }
  .field { margin-bottom: 16px; }
  label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
  input[type=email], input[type=password] { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; outline: none; transition: border-color .2s; }
  input:focus { border-color: #000; }
  .btn { width: 100%; padding: 11px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; margin-top: 4px; transition: opacity .15s; }
  .btn:hover { opacity: .85; }
  .btn-allow { background: #000; color: #fff; }
  .btn-deny { background: #f0f0f0; color: #333; width: auto; padding: 11px 20px; margin-right: 8px; }
  .btn-row { display: flex; justify-content: flex-end; align-items: center; margin-top: 24px; }
  .error { color: #d32f2f; font-size: 13px; margin-bottom: 16px; background: #fff3f3; padding: 8px 12px; border-radius: 6px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">Oewang</div>
  ${body}
</div>
</body>
</html>`;
}

const apiUrl = () =>
  Env.NEXT_PUBLIC_API_URL ?? `http://localhost:${Env.API_PORT ?? 3002}`;
const appUrl = () => Env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
      authorization_endpoint: `${apiUrl()}/oauth/authorize`,
      token_endpoint: `${apiUrl()}/oauth/token`,
      registration_endpoint: `${apiUrl()}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    };
  })

  // OpenID Connect discovery (ChatGPT and some clients request this alongside RFC 8414)
  .get("/.well-known/openid-configuration", ({ set }) => {
    set.headers["Content-Type"] = "application/json";
    return {
      issuer: apiUrl(),
      authorization_endpoint: `${apiUrl()}/oauth/authorize`,
      token_endpoint: `${apiUrl()}/oauth/token`,
      registration_endpoint: `${apiUrl()}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["openid", "read", "write"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["HS256"],
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
    const issuedAt = Math.floor(Date.now() / 1000);

    await db.insert(mcp_oauth_clients).values({
      client_id: clientId,
      client_name: String(client_name),
      redirect_uris: redirect_uris.map(String),
    });

    // RFC 7591 requires 201 Created
    set.status = 201;
    return {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_name,
      redirect_uris,
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "none",
      response_types: ["code"],
      client_secret_expires_at: 0,
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

  // ── OAuth Authorization page (self-contained HTTPS consent flow) ────────────────────────

  .get("/oauth/authorize", async ({ query, headers, set }) => {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } =
      query as Record<string, string>;

    if (!client_id || !redirect_uri || response_type !== "code") {
      set.status = 400;
      set.headers["Content-Type"] = "text/html; charset=utf-8";
      return "<h2>Bad Request: missing client_id, redirect_uri, or response_type</h2>";
    }

    const client = await db.query.mcp_oauth_clients.findFirst({
      where: eq(mcp_oauth_clients.client_id, client_id),
    });
    const clientName = client?.client_name ?? client_id;

    // Check for an existing MCP OAuth session cookie
    const cookieHeader = (headers as Record<string, string>)["cookie"] ?? "";
    const sessionMatch = cookieHeader.match(/(?:^|;\s*)oewang_mcp_oauth=([^;]+)/);
    const mcpToken = sessionMatch?.[1];

    let authedUser: Awaited<ReturnType<typeof getAuth>> = null;
    if (mcpToken) {
      authedUser = await getAuth(mcpToken);
    }

    const hiddenFields = [
      `<input type="hidden" name="client_id" value="${escapeHtml(client_id)}">`,
      `<input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">`,
      state ? `<input type="hidden" name="state" value="${escapeHtml(state)}">` : "",
      code_challenge
        ? `<input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}">`
        : "",
    ].join("\n");

    set.headers["Content-Type"] = "text/html; charset=utf-8";

    if (authedUser) {
      return oauthHtml(`
        <h1 class="title">Authorize ${escapeHtml(clientName)}</h1>
        <p class="subtitle"><strong>${escapeHtml(clientName)}</strong> wants access to your Oewang workspace.</p>
        <form method="POST" action="/oauth/authorize">
          ${hiddenFields}
          <div class="btn-row">
            <button type="submit" name="action" value="deny" class="btn btn-deny">Deny</button>
            <button type="submit" name="action" value="allow" class="btn btn-allow">Allow</button>
          </div>
        </form>
      `);
    }

    return oauthHtml(`
      <h1 class="title">Sign in to Oewang</h1>
      <p class="subtitle">to authorize <strong>${escapeHtml(clientName)}</strong></p>
      <form method="POST" action="/oauth/authorize">
        ${hiddenFields}
        <input type="hidden" name="action" value="login">
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" required autocomplete="email">
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" name="password" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-allow">Sign in &amp; Continue</button>
      </form>
    `);
  })

  .post("/oauth/authorize", async ({ body: rawBody, headers, set }) => {
    const body = (rawBody as Record<string, string>) ?? {};
    const { action, client_id, redirect_uri, state, code_challenge, email, password } = body;

    if (!client_id || !redirect_uri) {
      set.status = 400;
      return "Bad Request";
    }

    // ── Login step ──
    if (action === "login") {
      if (!email || !password) {
        set.status = 400;
        return "Email and password required";
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase().trim()))
        .limit(1);

      const valid = user?.password_hash
        ? await Bun.password.verify(password, user.password_hash)
        : false;

      if (!valid || !user) {
        set.status = 401;
        set.headers["Content-Type"] = "text/html; charset=utf-8";
        const params = new URLSearchParams({
          client_id,
          redirect_uri,
          response_type: "code",
          ...(state ? { state } : {}),
          ...(code_challenge ? { code_challenge, code_challenge_method: "S256" } : {}),
        });
        return oauthHtml(`
          <h1 class="title">Sign in to Oewang</h1>
          <p class="error">Invalid email or password.</p>
          <form method="POST" action="/oauth/authorize">
            <input type="hidden" name="client_id" value="${escapeHtml(client_id)}">
            <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">
            ${state ? `<input type="hidden" name="state" value="${escapeHtml(state)}">` : ""}
            ${code_challenge ? `<input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}">` : ""}
            <input type="hidden" name="action" value="login">
            <div class="field"><label>Email</label><input type="email" name="email" value="${escapeHtml(email)}" required autocomplete="email"></div>
            <div class="field"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div>
            <button type="submit" class="btn btn-allow">Sign in &amp; Continue</button>
          </form>
        `);
      }

      // Create short-lived MCP OAuth session token (1h) and re-derive auth context
      const secret = new TextEncoder().encode(Env.JWT_SECRET!);
      const mcpSessionToken = await new jose.SignJWT({
        user_id: user.id,
        workspace_id: user.workspace_id ?? "",
        email: user.email,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(secret);

      const cookieDomain =
        Env.NODE_ENV === "production" ? "; Domain=.oewang.com" : "";
      set.headers["Set-Cookie"] =
        `oewang_mcp_oauth=${mcpSessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/oauth; Max-Age=3600${cookieDomain}`;

      const params = new URLSearchParams({
        client_id,
        redirect_uri,
        response_type: "code",
        ...(state ? { state } : {}),
        ...(code_challenge ? { code_challenge, code_challenge_method: "S256" } : {}),
      });
      set.redirect = `/oauth/authorize?${params}`;
      set.status = 302;
      return;
    }

    // ── Deny step ──
    if (action === "deny") {
      const url = new URL(redirect_uri);
      url.searchParams.set("error", "access_denied");
      if (state) url.searchParams.set("state", state);
      set.redirect = url.toString();
      set.status = 302;
      return;
    }

    // ── Allow step ──
    if (action === "allow") {
      const cookieHeader = (headers as Record<string, string>)["cookie"] ?? "";
      const sessionMatch = cookieHeader.match(/(?:^|;\s*)oewang_mcp_oauth=([^;]+)/);
      const mcpToken = sessionMatch?.[1];
      const authedUser = mcpToken ? await getAuth(mcpToken) : null;

      if (!authedUser) {
        set.status = 401;
        return "Session expired. Please try again.";
      }

      const code = generateToken();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.insert(mcp_auth_codes).values({
        code,
        client_id,
        user_id: authedUser.user_id,
        workspace_id: authedUser.workspace_id,
        redirect_uri,
        code_challenge: code_challenge ?? null,
        expires_at: expiresAt,
      });

      const url = new URL(redirect_uri);
      url.searchParams.set("code", code);
      if (state) url.searchParams.set("state", state);
      set.redirect = url.toString();
      set.status = 302;
      return;
    }

    set.status = 400;
    return "Unknown action";
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
