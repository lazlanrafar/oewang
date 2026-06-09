import { NextResponse } from "next/server";

import { Env } from "@workspace/constants";

export async function GET(request: Request) {
  const state = crypto.randomUUID();
  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/api/auth/github/callback`;

  const params = new URLSearchParams({
    client_id: Env.GITHUB_CLIENT_ID!,
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
