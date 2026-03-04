import { decrypt } from "@workspace/encryption";
import type { ApiResponse } from "@workspace/types";
import axios from "axios";
import { Env } from "@workspace/constants";

// Create a configured axios instance
export const axiosInstance = axios.create({
  baseURL: `${Env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/v1`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — attaches the app JWT from cookies or localStorage
axiosInstance.interceptors.request.use(async (config) => {
  let token: string | undefined;

  const cookieName = Env.NEXT_PUBLIC_SESSION_COOKIE_NAME || "okane-session";

  if (typeof window !== "undefined") {
    // 1. Client-side: Try to get token from cookies
    const cookies = document.cookie.split(";");
    token = cookies
      .find((c) => c.trim().startsWith(`${cookieName}=`))
      ?.split("=")[1];

    // 2. Client-side: Fallback to localStorage
    if (!token) {
      token =
        localStorage.getItem("auth-token") ||
        localStorage.getItem("token") ||
        undefined;
    }
  }

  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // 3. Fallback to Supabase session (browser only)
  if (!config.headers.Authorization && typeof window !== "undefined") {
    try {
      const { createBrowserClient } =
        await import("@workspace/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch (e) {
      // Ignore
    }
  }

  return config;
});

// Response interceptor — handles decryption
axiosInstance.interceptors.response.use(
  (response) => {
    const is_encrypted = response.headers["x-encrypted"] === "true";
    if (is_encrypted && response.data?.data) {
      const secret = Env.ENCRYPTION_KEY;
      if (secret) {
        try {
          const decrypted = decrypt(response.data.data, secret);
          const parsed: ApiResponse<unknown> = JSON.parse(decrypted);
          response.data = parsed;
          (response as any)._api_response = parsed;
        } catch (e) {
          console.error("Failed to decrypt response", e);
        }
      }
    }
    return response;
  },
  (error) => {
    if (error.response) {
      const is_encrypted = error.response.headers["x-encrypted"] === "true";
      if (is_encrypted && error.response.data?.data) {
        const secret = Env.ENCRYPTION_KEY;
        if (secret) {
          try {
            const decrypted = decrypt(error.response.data.data, secret);
            const parsed: ApiResponse<unknown> = JSON.parse(decrypted);
            error.response.data = parsed;
          } catch (e) {
            console.error("Failed to decrypt error response", e);
          }
        }
      }
    }
    return Promise.reject(error);
  },
);
