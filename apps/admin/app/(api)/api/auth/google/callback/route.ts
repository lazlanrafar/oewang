import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { Env } from "@workspace/constants";
import { axiosInstance } from "@workspace/modules/server";

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
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth_state")?.value;

  if (!code || !state || state !== storedState) {
    const res = NextResponse.redirect(`${origin}/login?error=oauth_state_mismatch`);
    res.cookies.delete("oauth_state");
    return res;
  }

  const client_id = Env.GOOGLE_CLIENT_ID;
  const client_secret = Env.GOOGLE_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    const res = NextResponse.redirect(`${origin}/login?error=oauth_config_missing`);
    res.cookies.delete("oauth_state");
    return res;
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
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

    if (!tokenRes.ok) throw new Error("Failed to exchange Google code for token");

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token as string;

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) throw new Error("Failed to fetch Google user info");

    const googleUser = await userRes.json();

    const connectRes = await axiosInstance.post("auth/oauth/connect", {
      provider: "google",
      provider_user_id: googleUser.sub as string,
      email: googleUser.email as string,
      name: googleUser.name as string | undefined,
      avatar_url: googleUser.picture as string | undefined,
    });

    const { token } = connectRes.data.data as {
      token: string;
      user_id: string;
      workspace_id: string | null;
    };

    const isProduction = Env.NODE_ENV === "production";
    const cookieName = Env.NEXT_PUBLIC_SESSION_COOKIE_NAME;
    const response = NextResponse.redirect(`${origin}/overview`);

    response.cookies.set(cookieName, token, {
      path: "/",
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      ...(isProduction ? { domain: ".oewang.com" } : {}),
    });
    response.cookies.delete("oauth_state");

    return response;
  } catch (err) {
    console.error("[Google OAuth]", err);
    const res = NextResponse.redirect(`${origin}/login?error=oauth_failed`);
    res.cookies.delete("oauth_state");
    return res;
  }
}
