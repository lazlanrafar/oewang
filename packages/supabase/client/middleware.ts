import { createServerClient as supabaseCreateServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { Env } from "@workspace/constants";

/**
 * Create a Supabase client for use in Next.js middleware.
 * Handles cookie-based auth for SSR.
 */
export function createMiddlewareClient(
  request: NextRequest,
  response: NextResponse,
) {
  const supabaseUrl = Env.SUPABASE_URL;
  const supabaseAnonKey = Env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables",
    );
  }

  return supabaseCreateServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
    cookieOptions: Env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME
      ? { name: Env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME }
      : undefined,
  });
}
