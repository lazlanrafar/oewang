"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@workspace/supabase/server";
import type { ActionResponse } from "@workspace/types";

import { axiosInstance } from "../lib/axios";

import { sync_user } from "../user/user.action";
import { createWorkspace } from "../workspace/workspace.action";
import { Env } from "@workspace/constants";

export async function login(
  form_data: FormData,
): Promise<ActionResponse<void>> {
  const email = form_data.get("email") as string;
  const password = form_data.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Sync user and check workspace
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    try {
      const syncResult = await sync_user({
        id: user.id,
        email: user.email ?? "",
        name: user.user_metadata?.full_name || user.user_metadata?.name,
        oauth_provider: "email",
        profile_picture:
          user.user_metadata?.avatar_url || user.user_metadata?.picture,
        providers: user.app_metadata?.providers,
      });

      if (syncResult.success && syncResult.data) {
        if (syncResult.data.has_workspace === false) {
          redirect("/create-workspace");
        }

        // 3. Exchange for app JWT
        const { data: session_data } = await supabase.auth.getSession();
        if (session_data.session?.access_token) {
          const exchangeResult = await exchangeSupabaseToken(
            session_data.session.access_token,
          );

          if (exchangeResult.success && exchangeResult.data) {
            (await cookies()).set("okane-session", exchangeResult.data.token, {
              path: "/",
              httpOnly: true,
              secure: Env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: 60 * 60 * 24 * 7, // 7 days
            });
          }
        }
      }
    } catch (e: any) {
      if (isRedirectError(e)) throw e;
      console.error("Sync error:", e);
    }
  }

  redirect("/overview");
}

export async function signup(
  form_data: FormData,
): Promise<ActionResponse<void>> {
  const origin = (await headers()).get("origin");
  const email = form_data.get("email") as string;
  const password = form_data.get("password") as string;
  const name = form_data.get("name") as string | undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
      },
      emailRedirectTo: `${origin}/api/auth/callback`,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Sync user to Drizzle database via API
  if (data.user) {
    try {
      const syncResult = await sync_user({
        id: data.user.id,
        email: data.user.email ?? "",
        name: name,
        oauth_provider: "email",
      });

      if (syncResult.success && syncResult.data) {
        if (syncResult.data.has_workspace === false) {
          redirect("/create-workspace");
        }

        // 3. Exchange for app JWT
        const { data: session_data } = await supabase.auth.getSession();
        if (session_data.session?.access_token) {
          const exchangeResult = await exchangeSupabaseToken(
            session_data.session.access_token,
          );

          if (exchangeResult.success && exchangeResult.data) {
            (await cookies()).set("okane-session", exchangeResult.data.token, {
              path: "/",
              httpOnly: true,
              secure: Env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: 60 * 60 * 24 * 7, // 7 days
            });
          }
        }
      }
    } catch (e: any) {
      if (isRedirectError(e)) throw e;
      console.error("Sync error:", e);
    }
  }

  redirect("/overview");
}

export async function loginWithOAuth(
  provider: "google" | "github",
): Promise<ActionResponse<void>> {
  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/api/auth/callback`,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }

  return { success: true, data: undefined };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete("okane-session");
  redirect("/login");
}

export async function createWorkspaceAction(data: {
  name: string;
  country?: string;
  mainCurrencyCode?: string;
  mainCurrencySymbol?: string;
}): Promise<ActionResponse<void>> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // 1. Create workspace via API
    const wsResult = await createWorkspace(data, session.access_token);
    if (!wsResult.success) {
      return { success: false, error: wsResult.error };
    }

    // 2. Exchange token for app JWT (now with workspace_id)
    const exchangeResult = await exchangeSupabaseToken(session.access_token);
    if (!exchangeResult.success || !exchangeResult.data) {
      return {
        success: false,
        error: exchangeResult.error || "Failed to establish session",
      };
    }

    // 3. Set cookie
    (await cookies()).set("okane-session", exchangeResult.data.token, {
      path: "/",
      httpOnly: true,
      secure: Env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("Failed to create workspace:", error);
    return {
      success: false,
      error: error.message || "Failed to create workspace",
    };
  }

  redirect("/overview");
}

export async function exchangeSupabaseToken(supabase_token: string): Promise<
  ActionResponse<{
    token: string;
    user_id: string;
    workspace_id: string | null;
  }>
> {
  try {
    const response = await axiosInstance.post(
      "auth/token",
      {},
      { headers: { Authorization: `Bearer ${supabase_token}` } },
    );
    return { success: true, data: response.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to exchange token",
    };
  }
}
