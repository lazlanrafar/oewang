import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

import { Env } from "@workspace/constants";
import { axiosInstance } from "@workspace/modules/server";

const APPLE_ISSUER = "https://appleid.apple.com";
const appleJwks = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));

function getRequestOrigin(request: Request): string {
  // Pin the origin to the configured app URL. Deriving it from Host /
  // X-Forwarded-* headers lets an attacker poison the OAuth redirect_uri and the
  // post-login redirect (host-header injection / open redirect).
  return (Env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
}

// Apple's client "secret" isn't a static string like Google/GitHub's — it's a
// short-lived ES256 JWT self-signed with the private key from the .p8 file
// Apple issues for the Services ID (APPLE_KEY_ID / APPLE_TEAM_ID).
async function buildAppleClientSecret(client_id: string): Promise<string> {
  // Stored as a single-line env var with literal \n escapes (like most PEM-in-env
  // setups) rather than a real multiline value — unescape before parsing as PKCS8.
  const pemKey = (Env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const privateKey = await importPKCS8(pemKey, "ES256");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: Env.APPLE_KEY_ID })
    .setIssuer(Env.APPLE_TEAM_ID ?? "")
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 5) // minted per-exchange, 5 min is plenty
    .setAudience(APPLE_ISSUER)
    .setSubject(client_id)
    .sign(privateKey);
}

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const form = await request.formData();
  const code = form.get("code") as string | null;
  const state = form.get("state") as string | null;
  // Set by the initiating /api/auth/apple?mobile=1 request — see its comment.
  const isMobile = (state ?? "").endsWith(".mobile");
  const errorRedirect = (error: string) =>
    isMobile
      ? `oewang://oauth-callback?error=${error}`
      : `${origin}/login?error=${error}`;

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth_state")?.value;

  if (!code || !state || state !== storedState) {
    console.error("[Apple OAuth] state mismatch", {
      hasCode: !!code,
      hasState: !!state,
      hasStoredState: !!storedState,
    });
    const res = NextResponse.redirect(errorRedirect("oauth_state_mismatch"));
    res.cookies.delete("oauth_state");
    return res;
  }

  const client_id = Env.APPLE_CLIENT_ID;
  if (!client_id || !Env.APPLE_TEAM_ID || !Env.APPLE_KEY_ID || !Env.APPLE_PRIVATE_KEY) {
    const res = NextResponse.redirect(errorRedirect("oauth_config_missing"));
    res.cookies.delete("oauth_state");
    return res;
  }

  try {
    const redirectUri = `${origin}/api/auth/apple/callback`;
    const client_secret = await buildAppleClientSecret(client_id);

    const tokenRes = await fetch(`${APPLE_ISSUER}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id,
        client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) throw new Error("Failed to exchange Apple code for token");

    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token as string;

    // Verify against Apple's JWKS — this id_token also flows through the
    // client during the initial /authorize leg for some flows, so unlike
    // Google's userinfo-endpoint round trip, don't trust it on signature
    // alone just because it arrived over TLS.
    const { payload } = await jwtVerify(idToken, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: client_id,
    });

    const appleSub = payload.sub as string;
    const email = payload.email as string | undefined;

    // Apple only sends the user's name once, as a JSON string in the `user`
    // form field, on the very first authorization — never again after that.
    const userField = form.get("user") as string | null;
    const name = userField
      ? (() => {
          try {
            const parsed = JSON.parse(userField) as {
              name?: { firstName?: string; lastName?: string };
            };
            return [parsed.name?.firstName, parsed.name?.lastName]
              .filter(Boolean)
              .join(" ") || undefined;
          } catch {
            return undefined;
          }
        })()
      : undefined;

    // Use axiosInstance — handles request encryption + response decryption automatically
    const connectRes = await axiosInstance.post(
      "auth/oauth/connect",
      {
        provider: "apple",
        provider_user_id: appleSub,
        email,
        name,
      },
      { headers: { "x-oauth-connect-secret": Env.OAUTH_CONNECT_SECRET ?? "" } },
    );

    const { token, workspace_id } = connectRes.data.data as {
      token: string;
      user_id: string;
      workspace_id: string | null;
    };

    if (isMobile) {
      const res = NextResponse.redirect(
        `oewang://oauth-callback?${new URLSearchParams({ token, workspace_id: workspace_id ?? "" })}`,
      );
      res.cookies.delete("oauth_state");
      return res;
    }

    const isProduction = Env.NODE_ENV === "production";
    const next = workspace_id ? "/overview" : "/create-workspace";
    // Redirect through /sync (public route) instead of straight to `next`:
    // it does the final navigation client-side after mount, so the browser
    // has fully committed this response's Set-Cookie before proxy.ts's
    // workspace guard reads it — a direct server redirect can otherwise race
    // it and bounce back to /login on slow/cold-compiling requests.
    const response = NextResponse.redirect(
      `${origin}/sync?returnTo=${encodeURIComponent(next)}`,
    );

    const cookieBase = {
      path: "/",
      secure: isProduction,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 7,
      ...(isProduction ? { domain: ".oewang.com" } : {}),
    };
    response.cookies.set("oewang-session", token, {
      ...cookieBase,
      httpOnly: true,
    });
    // Non-httpOnly companion flag the marketing site reads client-side.
    response.cookies.set("oewang-session-authed", "1", {
      ...cookieBase,
      httpOnly: false,
    });
    response.cookies.delete("oauth_state");

    return response;
  } catch (err) {
    console.error("[Apple OAuth]", err);
    // TEMPORARY (debugging live "oauth_failed" reports): surface the actual
    // error in the redirect since container stdout isn't visible via the
    // usual log tooling for this app. Remove once root-caused.
    const detail = encodeURIComponent(
      err instanceof Error ? err.message : String(err),
    );
    const res = NextResponse.redirect(
      isMobile
        ? `oewang://oauth-callback?error=oauth_failed&detail=${detail}`
        : `${origin}/login?error=oauth_failed&detail=${detail}`,
    );
    res.cookies.delete("oauth_state");
    return res;
  }
}
