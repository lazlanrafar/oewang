import { createBrowserClient as supabaseCreateBrowserClient } from "@supabase/ssr";
import { Env } from "@workspace/constants";

/**
 * Create a browser-side Supabase client.
 * Strictly uses NEXT_PUBLIC_ variables for browser compatibility.
 * Uses @supabase/ssr to handle cookie-based sessions.
 */
export function createBrowserClient() {
  const supabaseUrl = Env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = Env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return supabaseCreateBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: Env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME
      ? { name: Env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME }
      : undefined,
  });
}
