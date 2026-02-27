import { createBrowserClient as supabaseCreateBrowserClient } from "@supabase/ssr";

/**
 * Create a browser-side Supabase client.
 * Strictly uses NEXT_PUBLIC_ variables for browser compatibility.
 * Uses @supabase/ssr to handle cookie-based sessions.
 */
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return supabaseCreateBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME
      ? { name: process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME }
      : undefined,
  });
}
