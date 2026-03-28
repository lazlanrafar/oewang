import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createClient } from "@workspace/supabase/server";

import { exchangeSupabaseToken } from "@workspace/modules/server";
import { syncUser } from "@workspace/modules/server";
import { Env } from "@workspace/constants";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/overview";

  // Priority: x-forwarded-host (Railway proxy) → request.url origin (localhost dev)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "http";
  const { origin: requestOrigin } = new URL(request.url);
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : requestOrigin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        try {
          const syncResult = await syncUser({
            id: user.id,
            email: user.email ?? "",
            name: user.user_metadata?.full_name || user.user_metadata?.name,
            oauth_provider: user.app_metadata?.provider,
            profile_picture:
              user.user_metadata?.avatar_url || user.user_metadata?.picture,
            providers: user.app_metadata?.providers,
          });

          // If user has no workspace, redirect to create-workspace
          if (syncResult.success && syncResult.data?.has_workspace === false) {
            return NextResponse.redirect(`${origin}/create-workspace`);
          }

          // 2. Exchange for app JWT
          const { data: session_data } = await supabase.auth.getSession();
          if (session_data.session?.access_token) {
            const exchangeResult = await exchangeSupabaseToken(
              session_data.session.access_token,
            );
            if (exchangeResult.success && exchangeResult.data) {
              (await cookies()).set(
                "oewang-session",
                exchangeResult.data.token,
                {
                  path: "/",
                  httpOnly: true,
                  secure: Env.NODE_ENV === "production",
                  sameSite: "lax",
                  maxAge: 60 * 60 * 24 * 7, // 7 days
                },
              );
            }
          }
        } catch (e) {
          console.error("Failed to sync user on login callback:", e);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=AuthCodeError`);
}
