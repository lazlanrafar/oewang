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
  const redirectUri = `${origin}/api/auth/google/callback`;

  const client_id = Env.GOOGLE_CLIENT_ID;
  if (!client_id) {
    return NextResponse.json({ error: "Missing GOOGLE_CLIENT_ID" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);

  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: Env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  return response;
}
