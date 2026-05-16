import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, eq } from "drizzle-orm";
import * as dotenv from "dotenv";
import * as path from "path";
import { pricing } from "../../schema/pricing";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const ADDONS = [
  {
    name: "AI Token Pack (Small)",
    description: "Extra 1,500,000 AI tokens for your workspace every month.",
    prices: [
      { currency: "usd", monthly: 799, yearly: 7990, mayar_product_id: "AI_SMALL_PROD_USD" },
      { currency: "eur", monthly: 749, yearly: 7490, mayar_product_id: "AI_SMALL_PROD_EUR" },
      { currency: "idr", monthly: 129000, yearly: 1290000, mayar_product_id: "AI_SMALL_PROD_IDR" },
    ],
    max_vault_size_mb: 0,
    max_ai_tokens: 1500000,
    max_workspaces: 0,
    features: ["+1,500,000 AI tokens monthly"],
    is_active: true,
    is_addon: true,
    addon_type: "ai",
  },
  {
    name: "AI Token Pack (Large)",
    description: "Extra 5,000,000 AI tokens for your workspace every month.",
    prices: [
      { currency: "usd", monthly: 1999, yearly: 19990, mayar_product_id: "AI_LARGE_PROD_USD" },
      { currency: "eur", monthly: 1899, yearly: 18990, mayar_product_id: "AI_LARGE_PROD_EUR" },
      { currency: "idr", monthly: 329000, yearly: 3290000, mayar_product_id: "AI_LARGE_PROD_IDR" },
    ],
    max_vault_size_mb: 0,
    max_ai_tokens: 5000000,
    max_workspaces: 0,
    features: ["+5,000,000 AI tokens monthly"],
    is_active: true,
    is_addon: true,
    addon_type: "ai",
  },
  {
    name: "AI Turbo Pack",
    description: "Extra 10,000,000 AI tokens — ideal for power users with heavy AI workflows.",
    prices: [
      { currency: "usd", monthly: 3999, yearly: 39990, mayar_product_id: "AI_TURBO_PROD_USD" },
      { currency: "eur", monthly: 3699, yearly: 36990, mayar_product_id: "AI_TURBO_PROD_EUR" },
      { currency: "idr", monthly: 649000, yearly: 6490000, mayar_product_id: "AI_TURBO_PROD_IDR" },
    ],
    max_vault_size_mb: 0,
    max_ai_tokens: 10000000,
    max_workspaces: 0,
    features: ["+10,000,000 AI tokens monthly", "Best value for high-volume AI use"],
    is_active: true,
    is_addon: true,
    addon_type: "ai",
  },
  {
    name: "Storage Pack (Small)",
    description: "Extra 25 GB secure storage for your vault every month.",
    prices: [
      { currency: "usd", monthly: 299, yearly: 2990, mayar_product_id: "VAULT_SMALL_PROD_USD" },
      { currency: "eur", monthly: 299, yearly: 2990, mayar_product_id: "VAULT_SMALL_PROD_EUR" },
      { currency: "idr", monthly: 49000, yearly: 490000, mayar_product_id: "VAULT_SMALL_PROD_IDR" },
    ],
    max_vault_size_mb: 25600,
    max_ai_tokens: 0,
    max_workspaces: 0,
    features: ["+25 GB vault storage monthly"],
    is_active: true,
    is_addon: true,
    addon_type: "vault",
  },
  {
    name: "Storage Pack (Large)",
    description: "Extra 100 GB secure storage for your vault every month.",
    prices: [
      { currency: "usd", monthly: 899, yearly: 8990, mayar_product_id: "VAULT_LARGE_PROD_USD" },
      { currency: "eur", monthly: 849, yearly: 8490, mayar_product_id: "VAULT_LARGE_PROD_EUR" },
      { currency: "idr", monthly: 149000, yearly: 1490000, mayar_product_id: "VAULT_LARGE_PROD_IDR" },
    ],
    max_vault_size_mb: 102400,
    max_ai_tokens: 0,
    max_workspaces: 0,
    features: ["+100 GB vault storage monthly"],
    is_active: true,
    is_addon: true,
    addon_type: "vault",
  },
  {
    name: "Storage Ultra",
    description: "Extra 500 GB secure vault storage — built for teams with large file archives.",
    prices: [
      { currency: "usd", monthly: 2999, yearly: 29990, mayar_product_id: "VAULT_ULTRA_PROD_USD" },
      { currency: "eur", monthly: 2799, yearly: 27990, mayar_product_id: "VAULT_ULTRA_PROD_EUR" },
      { currency: "idr", monthly: 499000, yearly: 4990000, mayar_product_id: "VAULT_ULTRA_PROD_IDR" },
    ],
    max_vault_size_mb: 512000,
    max_ai_tokens: 0,
    max_workspaces: 0,
    features: ["+500 GB vault storage monthly", "Best value for high-volume storage"],
    is_active: true,
    is_addon: true,
    addon_type: "vault",
  },
];

export async function seedAddons() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  console.log("🌱 Seeding add-ons...");

  for (const addon of ADDONS) {
    const existing = await db.execute(
      sql`SELECT id FROM pricing WHERE lower(name) = lower(${addon.name}) AND deleted_at IS NULL LIMIT 1`,
    );

    if (existing.length > 0) {
      await db.update(pricing).set(addon).where(eq(pricing.id, (existing[0] as any).id));
      console.log(`  ↻  Updated: "${addon.name}"`);
    } else {
      const [inserted] = await db.insert(pricing).values(addon).returning({ id: pricing.id, name: pricing.name });
      console.log(`  ✓  Inserted: "${inserted!.name}"`);
    }
  }

  await client.end();
  console.log("✅ Add-ons seeded.\n");
}

if (import.meta.main) {
  seedAddons().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
  });
}
