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
  const state = crypto.randomUUID();
  const origin = getRequestOrigin(request);
  const redirectUri = `${origin}/api/auth/github/callback`;

  const client_id = Env.GITHUB_CLIENT_ID;
  if (!client_id) {
    return NextResponse.json({ error: "Missing GITHUB_CLIENT_ID" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
  });

  const response = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params}`);

  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: Env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
}
