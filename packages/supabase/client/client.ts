"use client";

const ERR = "Supabase Auth has been removed. Use the oewang-session JWT cookie instead.";

export function createBrowserClient(): never {
  throw new Error(ERR);
}
