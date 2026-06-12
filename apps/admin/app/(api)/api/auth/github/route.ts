import { NextResponse } from "next/server";

import { Env } from "@workspace/constants";

function getRequestOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) {
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
    const scheme = isLocal ? "http" : proto;
    return `${scheme}://${host}`;
  }
  return Env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
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
