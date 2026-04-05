import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from root
dotenv.config({ path: path.join(__dirname, "../../../.env") });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pricing } from "../schema/pricing";
import { eq } from "drizzle-orm";

async function seedAddons() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema: { pricing } });
  const addons = [
    {
      name: "AI 500k Pack",
      description: "Additional 500,000 AI tokens per month",
      addon_type: "ai" as const,
      max_ai_tokens: 500000,
      max_vault_size_mb: 0,
      prices: [
        { currency: "usd", monthly: 10, yearly: 100, xendit_product_id: "AI_500K_PROD_USD" },
        { currency: "idr", monthly: 150000, yearly: 1500000, xendit_product_id: "AI_500K_PROD_IDR" },
        { currency: "jpy", monthly: 1500, yearly: 15000, xendit_product_id: "AI_500K_PROD_JPY" },
      ],
    },
    {
      name: "AI 1M Pack",
      description: "Additional 1,000,000 AI tokens per month",
      addon_type: "ai" as const,
      max_ai_tokens: 1000000,
      max_vault_size_mb: 0,
      prices: [
        { currency: "usd", monthly: 18, yearly: 180, xendit_product_id: "AI_1M_PROD_USD" },
        { currency: "idr", monthly: 270000, yearly: 2700000, xendit_product_id: "AI_1M_PROD_IDR" },
        { currency: "jpy", monthly: 2700, yearly: 27000, xendit_product_id: "AI_1M_PROD_JPY" },
      ],
    },
    {
      name: "Vault 5GB Pack",
      description: "Additional 5GB storage per month",
      addon_type: "vault" as const,
      max_ai_tokens: 0,
      max_vault_size_mb: 5120,
      prices: [
        { currency: "usd", monthly: 5, yearly: 50, xendit_product_id: "VAULT_5GB_PROD_USD" },
        { currency: "idr", monthly: 75000, yearly: 750000, xendit_product_id: "VAULT_5GB_PROD_IDR" },
        { currency: "jpy", monthly: 750, yearly: 7500, xendit_product_id: "VAULT_5GB_PROD_JPY" },
      ],
    },
    {
      name: "Vault 20GB Pack",
      description: "Additional 20GB storage per month",
      addon_type: "vault" as const,
      max_ai_tokens: 0,
      max_vault_size_mb: 20480,
      prices: [
        { currency: "usd", monthly: 15, yearly: 150, xendit_product_id: "VAULT_20GB_PROD_USD" },
        { currency: "idr", monthly: 225000, yearly: 2250000, xendit_product_id: "VAULT_20GB_PROD_IDR" },
        { currency: "jpy", monthly: 2250, yearly: 22500, xendit_product_id: "VAULT_20GB_PROD_JPY" },
      ],
    },
  ];

  for (const addon of addons) {
    const existing = await db.query.pricing.findFirst({
      where: eq(pricing.name, addon.name),
    });

    if (existing) {
      await db.update(pricing).set({ ...addon, is_addon: true }).where(eq(pricing.id, existing.id));
      console.log(`Updated addon: ${addon.name}`);
    } else {
      await db.insert(pricing).values({ ...addon, is_addon: true });
      console.log(`Created addon: ${addon.name}`);
    }
  }
}

seedAddons()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
