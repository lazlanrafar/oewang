import * as path from "node:path";
import * as dotenv from "dotenv";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pricing } from "../../schema/pricing";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
}

import type { InferInsertModel } from "drizzle-orm";

type AddonInsert = InferInsertModel<typeof pricing>;

const ADDONS: AddonInsert[] = [
  {
    name: "AI Token Pack (Mini)",
    description: "Extra 1,000,000 AI tokens for affordable daily tracking.",
    prices: [
      {
        currency: "usd",
        monthly: 1200,
        yearly: 11600,
        mayar_product_id: "AI_MINI_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 1200,
        yearly: 11600,
        mayar_product_id: "AI_MINI_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 119600,
        yearly: 1148000,
        mayar_product_id: "AI_MINI_PROD_IDR",
      },
    ],
    max_vault_size_mb: 0,
    max_ai_tokens: 1000000,
    max_workspaces: 0,
    features: [
      "+1,000,000 AI tokens monthly",
      "Affordable boost for daily AI insights",
    ],
    is_active: true,
    is_addon: true,
    addon_type: "ai",
  },
  {
    name: "AI Token Pack (Small)",
    description: "Extra 6,000,000 AI tokens for your workspace every month.",
    prices: [
      {
        currency: "usd",
        monthly: 6000,
        yearly: 57600,
        mayar_product_id: "AI_SMALL_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 5600,
        yearly: 53600,
        mayar_product_id: "AI_SMALL_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 599600,
        yearly: 5756000,
        mayar_product_id: "AI_SMALL_PROD_IDR",
      },
    ],
    max_vault_size_mb: 0,
    max_ai_tokens: 6000000,
    max_workspaces: 0,
    features: ["+6,000,000 AI tokens monthly"],
    is_active: true,
    is_addon: true,
    addon_type: "ai",
  },
  {
    name: "AI Token Pack (Large)",
    description: "Extra 20,000,000 AI tokens for your workspace every month.",
    prices: [
      {
        currency: "usd",
        monthly: 15600,
        yearly: 149600,
        mayar_product_id: "AI_LARGE_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 14400,
        yearly: 138400,
        mayar_product_id: "AI_LARGE_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 1599600,
        yearly: 15356000,
        mayar_product_id: "AI_LARGE_PROD_IDR",
      },
    ],
    max_vault_size_mb: 0,
    max_ai_tokens: 20000000,
    max_workspaces: 0,
    features: ["+20,000,000 AI tokens monthly"],
    is_active: true,
    is_addon: true,
    addon_type: "ai",
  },
  {
    name: "AI Turbo Pack",
    description:
      "Extra 40,000,000 AI tokens — ideal for power users with heavy AI workflows.",
    prices: [
      {
        currency: "usd",
        monthly: 27600,
        yearly: 264800,
        mayar_product_id: "AI_TURBO_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 25600,
        yearly: 245600,
        mayar_product_id: "AI_TURBO_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 2799600,
        yearly: 26876000,
        mayar_product_id: "AI_TURBO_PROD_IDR",
      },
    ],
    max_vault_size_mb: 0,
    max_ai_tokens: 40000000,
    max_workspaces: 0,
    features: [
      "+40,000,000 AI tokens monthly",
      "Best value for high-volume AI use",
    ],
    is_active: true,
    is_addon: true,
    addon_type: "ai",
  },
  {
    name: "Storage Pack (Mini)",
    description: "Extra 5 GB secure storage for receipts and daily documents.",
    prices: [
      {
        currency: "usd",
        monthly: 200,
        yearly: 1900,
        mayar_product_id: "VAULT_MINI_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 200,
        yearly: 1900,
        mayar_product_id: "VAULT_MINI_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 19900,
        yearly: 191000,
        mayar_product_id: "VAULT_MINI_PROD_IDR",
      },
    ],
    max_vault_size_mb: 5120,
    max_ai_tokens: 0,
    max_workspaces: 0,
    features: [
      "+5 GB vault storage monthly",
      "Affordable receipt storage add-on",
    ],
    is_active: true,
    is_addon: true,
    addon_type: "vault",
  },
  {
    name: "Storage Pack (Small)",
    description: "Extra 25 GB secure storage for your vault every month.",
    prices: [
      {
        currency: "usd",
        monthly: 600,
        yearly: 5800,
        mayar_product_id: "VAULT_SMALL_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 600,
        yearly: 5800,
        mayar_product_id: "VAULT_SMALL_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 59900,
        yearly: 575000,
        mayar_product_id: "VAULT_SMALL_PROD_IDR",
      },
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
      {
        currency: "usd",
        monthly: 1800,
        yearly: 17300,
        mayar_product_id: "VAULT_LARGE_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 1700,
        yearly: 16300,
        mayar_product_id: "VAULT_LARGE_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 179900,
        yearly: 1727000,
        mayar_product_id: "VAULT_LARGE_PROD_IDR",
      },
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
    description:
      "Extra 500 GB secure vault storage — built for teams with large file archives.",
    prices: [
      {
        currency: "usd",
        monthly: 5900,
        yearly: 56600,
        mayar_product_id: "VAULT_ULTRA_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 5500,
        yearly: 52800,
        mayar_product_id: "VAULT_ULTRA_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 599900,
        yearly: 5759000,
        mayar_product_id: "VAULT_ULTRA_PROD_IDR",
      },
    ],
    max_vault_size_mb: 512000,
    max_ai_tokens: 0,
    max_workspaces: 0,
    features: [
      "+500 GB vault storage monthly",
      "Best value for high-volume storage",
    ],
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
    const [existing] = await db
      .select({ id: pricing.id })
      .from(pricing)
      .where(
        and(
          sql`lower(${pricing.name}) = lower(${addon.name})`,
          isNull(pricing.deleted_at),
        ),
      )
      .limit(1);

    if (existing) {
      await db.update(pricing).set(addon).where(eq(pricing.id, existing.id));
      console.log(`  ↻  Updated: "${addon.name}"`);
    } else {
      const [inserted] = await db
        .insert(pricing)
        .values(addon)
        .returning({ id: pricing.id, name: pricing.name });
      console.log(`  ✓  Inserted: "${inserted!.name}"`);
    }
  }

  await client.end();
  console.log("✅ Add-ons seeded.\n");
}

if (process.argv[1]?.endsWith("02-addons.ts")) {
  seedAddons().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
  });
}
