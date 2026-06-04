const ERR = "Supabase Auth has been removed. Use the oewang-session JWT cookie instead.";

export function createAdminClient(): never {
  throw new Error(ERR);
}

export function createClient(): never {
  throw new Error(ERR);
}
