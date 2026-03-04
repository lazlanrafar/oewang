import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Env } from "@workspace/constants";

/**
 * Create a Supabase Admin client (Service Role).
 * Use only for admin tasks (bypassing RLS).
 */
export function createAdminClient() {
  const supabaseUrl = Env.SUPABASE_URL;
  const supabaseKey = Env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Create a generic Supabase client (Anon Key).
 * Suitable for API token verification or non-admin tasks in Node.js.
 */
export function createClient() {
  const supabaseUrl = Env.SUPABASE_URL;
  const supabaseKey = Env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
