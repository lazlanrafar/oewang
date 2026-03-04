import dotenv from "dotenv";
import path from "path";
import fs from "fs";

/**
 * Helper to find and load .env file from parent directories.
 * Only use this in Node.js environments (Server, Scripts, Configs).
 */
export function loadEnv() {
  // If strict env vars are already present, skip loading/overwriting
  if (process.env.DATABASE_URL && process.env.SUPABASE_URL) return;

  let current = process.cwd();
  // Traverse up up to 3 levels to find .env
  for (let i = 0; i < 3; i++) {
    const envPath = path.join(current, ".env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      // console.log(`✅ Loaded env from ${envPath}`);
      return;
    }
    current = path.dirname(current);
  }
}
