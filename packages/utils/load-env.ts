import dotenv from "dotenv";
import path from "path";
import fs from "fs";

/**
 * Helper to find and load .env file from parent directories.
 * Only use this in Node.js environments (Server, Scripts, Configs).
 */
export function loadEnv() {
  // Always try to load .env from parent directories if possible.
  // dotenv.config() will NOT overwrite existing process.env variables by default.

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
