import { Env } from "@workspace/constants";
import { decrypt } from "@workspace/encryption";
import type { ApiResponse } from "@workspace/types";
import axios from "axios";

// Create a configured axios instance
export const axiosInstance = axios.create({
  baseURL: `${Env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/v1`,
  headers: {
    "Content-Type": "application/json",
  },
  paramsSerializer: {
    serialize: (params) => {
      const searchParams = new URLSearchParams();
      for (const key in params) {
        const value = params[key];
        if (value === undefined || value === null || value === "") continue;

        if (Array.isArray(value)) {
          value.forEach((v) => {
            searchParams.append(key, String(v));
          });
        } else {
          searchParams.set(key, String(value));
        }
      }
      return searchParams.toString();
    },
  },
});

// Request interceptor — attaches the app JWT from cookies
axiosInstance.interceptors.request.use(async (config) => {
  let token: string | undefined;

  const cookieName = Env.NEXT_PUBLIC_SESSION_COOKIE_NAME || "oewang-session";

  // Server-side: Try to get token from Next.js cookies
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error — next/headers is available at runtime in Next.js server context
    const { cookies, headers } = await import("next/headers");
    const cookieStore = await cookies();
    token = cookieStore.get(cookieName)?.value;

    // Forward the real client IP: every server action leaves this box with
    // the app server's IP, so without this all users share one API
    // rate-limit bucket (the strict auth one would break login for everyone).
    const incoming = await headers();
    const forwarded_for = incoming.get("x-forwarded-for");
    if (forwarded_for && !config.headers["x-forwarded-for"]) {
      config.headers["x-forwarded-for"] = forwarded_for;
    }
  } catch (e) {
    // Ignore
  }

  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Request body encryption
  if (
    config.data &&
    ["post", "put", "patch"].includes(config.method?.toLowerCase() || "") &&
    !(config.data instanceof FormData)
  ) {
    const secret = Env.ENCRYPTION_KEY;
    if (secret) {
      const { encrypt: encryptBody } = await import("@workspace/encryption");
      try {
        const encrypted = encryptBody(JSON.stringify(config.data), secret);
        config.data = { data: encrypted };
        config.headers["x-encrypted"] = "true";
      } catch (e) {
        console.error("[Axios Server] Failed to encrypt request body", e);
      }
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
            if (
              typeof parsed.message === "string" &&
              parsed.message.length > 0
            ) {
              error.message = parsed.message;
            }
          } catch (e) {
            console.error("Failed to decrypt error response", e);
          }
        }
      }
    }
    return Promise.reject(error);
  },
);
