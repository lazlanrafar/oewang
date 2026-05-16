import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { seedPlans } from "./01-plans";
import { seedAddons } from "./02-addons";

async function main() {
  await seedPlans();
  await seedAddons();
  console.log("✅ All seeders complete.");
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
