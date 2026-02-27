import { decrypt } from "@workspace/encryption";
import type { ApiResponse } from "@workspace/types";
import axios from "axios";

// Create a configured axios instance
export const axiosInstance = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/v1`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — attaches the app JWT from cookies or localStorage
axiosInstance.interceptors.request.use(async (config) => {
  let token: string | undefined;

  const cookieName =
    process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME || "okane-session";

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
  } else {
    // 3. Server-side: Try to get token from Next.js cookies
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      token = cookieStore.get(cookieName)?.value;
    } catch (e) {
      // Ignore errors (e.g. if called outside request context)
    }
  }

  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Response interceptor — handles decryption of encrypted API responses
axiosInstance.interceptors.response.use(
  (response) => {
    // Check for encrypted response
    const is_encrypted = response.headers["x-encrypted"] === "true";
    if (is_encrypted && response.data?.data) {
      const secret = process.env.ENCRYPTION_KEY;
      if (secret) {
        try {
          const decrypted = decrypt(response.data.data, secret);
          const parsed: ApiResponse<unknown> = JSON.parse(decrypted);
          // Return the data field from ApiResponse for convenience
          response.data = parsed.data;
          // Attach full response metadata
          // biome-ignore lint/suspicious/noExplicitAny: Augmenting response object
          (response as any)._api_response = parsed;
        } catch (e) {
          console.error("Failed to decrypt response", e);
        }
      } else {
        console.warn("ENCRYPTION_KEY not set, cannot decrypt response");
      }
    }
    return response;
  },
  (error) => {
    // Handle encrypted error responses
    if (error.response) {
      const is_encrypted = error.response.headers["x-encrypted"] === "true";
      if (is_encrypted && error.response.data?.data) {
        const secret = process.env.ENCRYPTION_KEY;
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
