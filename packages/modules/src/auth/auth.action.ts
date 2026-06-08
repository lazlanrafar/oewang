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

async function setSessionCookie(token: string) {
  const isProduction = Env.NODE_ENV === "production";
  (await cookies()).set("oewang-session", token, sessionCookieOptions(isProduction));
}

export async function login(form_data: FormData): Promise<ActionResponse<void>> {
  const email = form_data.get("email") as string;
  const password = form_data.get("password") as string;

  try {
    const response = await axiosInstance.post("auth/login", { email, password });
    const result = response.data.data as { token: string; workspace_id: string | null };
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

export async function signup(form_data: FormData): Promise<ActionResponse<void>> {
  const email = form_data.get("email") as string;
  const password = form_data.get("password") as string;
  const name = form_data.get("name") as string | undefined;

  try {
    const response = await axiosInstance.post("auth/register", { email, password, name });
    const result = response.data.data as { token: string; workspace_id: string | null };
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

export async function loginWithOAuth(provider: "google" | "github"): Promise<ActionResponse<void>> {
  redirect(`/api/auth/${provider}`);
}

export async function logout() {
  (await cookies()).delete("oewang-session");
  redirect("/login");
}

export async function onboardingCreateWorkspaceAction(data: {
  name: string;
  country?: string;
  mainCurrencyCode?: string;
  mainCurrencySymbol?: string;
}): Promise<ActionResponse<Workspace>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("oewang-session")?.value;

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
