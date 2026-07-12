import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { Env } from "@workspace/constants";
import { axiosInstance } from "@workspace/modules/server";

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

  const client_id = Env.GITHUB_CLIENT_ID;
  const client_secret = Env.GITHUB_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    const res = NextResponse.redirect(`${origin}/login?error=oauth_config_missing`);
    res.cookies.delete("oauth_state");
    return res;
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id,
        client_secret,
        code,
        redirect_uri: `${origin}/api/auth/github/callback`,
      }),
    });

    if (!tokenRes.ok) throw new Error("Failed to exchange GitHub code for token");

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token as string;
    if (!accessToken) throw new Error("No access token in GitHub response");

    const [userRes, emailsRes] = await Promise.all([
      fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }),
      fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }),
    ]);

    if (!userRes.ok) throw new Error("Failed to fetch GitHub user info");

    const githubUser = await userRes.json();
    const emailsList = emailsRes.ok
      ? ((await emailsRes.json()) as {
          email: string;
          primary: boolean;
          verified: boolean;
        }[])
      : [];
    const primaryEmail =
      emailsList.find((e) => e.primary && e.verified)?.email ??
      emailsList[0]?.email ??
      (githubUser.email as string | null);

    if (!primaryEmail) throw new Error("No verified email from GitHub");

    // Use axiosInstance — handles request encryption + response decryption automatically
    const connectRes = await axiosInstance.post(
      "auth/oauth/connect",
      {
        provider: "github",
        provider_user_id: String(githubUser.id),
        email: primaryEmail,
        name: (githubUser.name as string | null) ?? (githubUser.login as string),
        avatar_url: githubUser.avatar_url as string | undefined,
      },
      { headers: { "x-oauth-connect-secret": Env.OAUTH_CONNECT_SECRET ?? "" } },
    );

    const { token, workspace_id } = connectRes.data.data as {
      token: string;
      user_id: string;
      workspace_id: string | null;
    };

    const isProduction = Env.NODE_ENV === "production";
    const next = workspace_id ? "/overview" : "/create-workspace";
    const response = NextResponse.redirect(`${origin}${next}`);

    response.cookies.set("oewang-session", token, {
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
    console.error("[GitHub OAuth]", err);
    const res = NextResponse.redirect(`${origin}/login?error=oauth_failed`);
    res.cookies.delete("oauth_state");
    return res;
  }
}
