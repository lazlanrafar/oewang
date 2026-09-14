"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Workspace } from "@workspace/types";

import type { ActionResponse } from "@workspace/types";

import { axiosInstance } from "../lib/axios.server";
import { createWorkspace } from "../workspace/workspace.action";
import { Env } from "@workspace/constants";
import { extractErrorMessage } from "../lib/error-message";

function sessionCookieOptions(isProduction: boolean) {
  return {
    path: "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    ...(isProduction ? { domain: ".oewang.com" } : {}),
  };
}

// Non-httpOnly companion flag the marketing site can read client-side (the real
// session cookie is httpOnly and invisible to JS). Only signals presence, no
// token. Must be set/cleared everywhere the session cookie is.
const AUTHED_FLAG_COOKIE = `${Env.NEXT_PUBLIC_SESSION_COOKIE_NAME}-authed`;

function authedFlagOptions(isProduction: boolean) {
  return { ...sessionCookieOptions(isProduction), httpOnly: false };
}

async function setSessionCookie(token: string) {
  const isProduction = Env.NODE_ENV === "production";
  const cookieName = Env.NEXT_PUBLIC_SESSION_COOKIE_NAME;
  const store = await cookies();
  store.set(cookieName, token, sessionCookieOptions(isProduction));
  store.set(AUTHED_FLAG_COOKIE, "1", authedFlagOptions(isProduction));
}

export async function login(
  form_data: FormData,
): Promise<ActionResponse<void>> {
  const email = form_data.get("email") as string;
  const password = form_data.get("password") as string;

  try {
    const response = await axiosInstance.post("auth/login", {
      email,
      password,
    });
    const result = response.data.data as {
      token: string;
      workspace_id: string | null;
    };
    await setSessionCookie(result.token);

    if (!result.workspace_id) {
      redirect("/create-workspace");
    }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error: extractErrorMessage(error, "Invalid email or password"),
    };
  }

  redirect("/overview");
}

export async function signup(
  form_data: FormData,
): Promise<ActionResponse<void>> {
  const email = form_data.get("email") as string;
  const password = form_data.get("password") as string;
  const name = form_data.get("name") as string | undefined;

  try {
    const response = await axiosInstance.post("auth/register", {
      email,
      password,
      name,
    });
    const result = response.data.data as {
      token: string;
      workspace_id: string | null;
    };
    await setSessionCookie(result.token);

    if (!result.workspace_id) {
      redirect("/create-workspace");
    }
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error: extractErrorMessage(error, "Registration failed"),
    };
  }

  redirect("/overview");
}

export async function loginWithOAuth(
  provider: "google" | "github",
): Promise<ActionResponse<{ url: string }>> {
  return { success: true, data: { url: `/api/auth/${provider}` } };
}

export async function logout() {
  const isProduction = Env.NODE_ENV === "production";
  const store = await cookies();
  // Deletion is keyed by (name, path, domain) — must match what setSessionCookie
  // used, or this clears a separate host-only cookie and leaves the real
  // .oewang.com-scoped session cookie (and its valid token) in place.
  const domain = isProduction ? { domain: ".oewang.com" } : {};
  store.delete({ name: Env.NEXT_PUBLIC_SESSION_COOKIE_NAME, path: "/", ...domain });
  store.delete({ name: AUTHED_FLAG_COOKIE, path: "/", ...domain });
  redirect("/login");
}

export async function onboardingCreateWorkspaceAction(data: {
  name: string;
  country?: string;
  mainCurrencyCode?: string;
  mainCurrencySymbol?: string;
}): Promise<ActionResponse<Workspace>> {
  const cookieStore = await cookies();
  const token = cookieStore.get(Env.NEXT_PUBLIC_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const wsResult = await createWorkspace(data);
    if (!wsResult.success || !wsResult.data) {
      return { success: false, error: wsResult.error };
    }
    const workspace = wsResult.data;

    // Re-issue JWT now that the workspace exists so workspace_id is included.
    try {
      const refreshResponse = await axiosInstance.post(
        "auth/refresh",
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (refreshResponse.data?.data?.token) {
        await setSessionCookie(refreshResponse.data.data.token);
      }
    } catch {
      // Non-fatal: existing JWT still valid, workspace_id will resolve on next request
    }

    return { success: true, data: workspace };
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error: extractErrorMessage(error, "Failed to create workspace"),
    };
  }
}
