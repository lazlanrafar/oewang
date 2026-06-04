"use server";

const ERR = "Supabase Auth has been removed. Use the oewang-session JWT cookie instead.";

export async function createClient(): Promise<never> {
  throw new Error(ERR);
}
