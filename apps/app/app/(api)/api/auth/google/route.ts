import { NextResponse } from "next/server";
import { Env } from "@workspace/constants";

export async function GET(request: Request) {
  const state = crypto.randomUUID();
  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: Env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );

  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: Env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  return response;
}
