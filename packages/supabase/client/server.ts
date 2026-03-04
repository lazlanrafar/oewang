import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Env } from "@workspace/constants";

/**
 * Create a Supabase client for Server Actions and Server Components.
 * Handles cookies for session management.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    Env.SUPABASE_URL!,
    Env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
      cookieOptions: Env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME
        ? { name: Env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME }
        : undefined,
    },
  );
}
