import { NextResponse } from "next/server";

import { Env } from "@workspace/constants";

function getRequestOrigin(request: Request): string {
  // Pin the origin to the configured app URL. Deriving it from Host /
  // X-Forwarded-* headers lets an attacker poison the OAuth redirect_uri and the
  // post-login redirect (host-header injection / open redirect).
  return (Env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
}

export async function GET(request: Request) {
  // `?mobile=1` is set by the native app's browser-based OAuth round-trip —
  // encoding it into `state` (echoed back verbatim by Apple) is how the
  // callback knows to hand off via the oewang:// deep link instead of
  // setting a web session cookie, without relying on cookie behavior in
  // whatever browser/webview opened this URL.
  const isMobile = new URL(request.url).searchParams.get("mobile") === "1";
  const state = isMobile ? `${crypto.randomUUID()}.mobile` : crypto.randomUUID();
  const origin = getRequestOrigin(request);
  const redirectUri = `${origin}/api/auth/apple/callback`;

  const client_id = Env.APPLE_CLIENT_ID;
  if (!client_id) {
    return NextResponse.json({ error: "Missing APPLE_CLIENT_ID" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "name email",
    state,
    // Apple requires form_post (not query-string) whenever the requested
    // scope includes name/email — the callback route below is a POST handler
    // for exactly that reason, unlike Google/GitHub's GET callbacks.
    response_mode: "form_post",
  });

  const response = NextResponse.redirect(`https://appleid.apple.com/auth/authorize?${params}`);

  // Apple's callback arrives as a cross-site POST (form_post from
  // appleid.apple.com), which SameSite=Lax cookies are never sent on — unlike
  // Google/GitHub's GET redirects. Needs SameSite=None, which browsers only
  // honor with Secure; Apple also requires an https redirect_uri regardless
  // of environment, so this is unconditionally secure, not gated on NODE_ENV.
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    // Longer than Google/GitHub's 10 min — Apple's own flow can involve a
    // trusted-device/2FA prompt that eats into the window before the user
    // gets back to the form_post callback.
    maxAge: 60 * 30, // 30 minutes
    path: "/",
  });

  return response;
}
