import * as dotenv from "dotenv";
import * as path from "path";

// Only load .env file if DATABASE_URL is not already injected by the caller.
// bun --env-file=../../.env.production already sets process.env before this runs.
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
}

import { seedPlans } from "./01-plans";
import { seedAddons } from "./02-addons";
import { seedAdminUser } from "./03-admin-user";

async function main() {
  await seedPlans();
  await seedAddons();
  await seedAdminUser();
  console.log("✅ All seeders complete.");
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
