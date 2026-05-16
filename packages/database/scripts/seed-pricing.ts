/**
 * Pricing seeder
 *
 * Usage:
 *   bun run --cwd packages/database scripts/seed-pricing.ts
 *
 * Safe to re-run — uses "INSERT ... ON CONFLICT DO NOTHING"
 * keyed on the plan `name`. Existing plans are left untouched.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, eq } from "drizzle-orm";
import * as dotenv from "dotenv";
import * as path from "path";
import { pricing } from "../schema/pricing";

// Load environment variables from root
dotenv.config({ path: path.join(__dirname, "../../../.env") });

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------
const PLANS = [
  {
    name: "Starter",
    description: "Get started for free with meaningful limits and no credit card.",
    prices: [
      { currency: "usd", monthly: 0, yearly: 0 },
      { currency: "eur", monthly: 0, yearly: 0 },
      { currency: "idr", monthly: 0, yearly: 0 },
    ],
    max_vault_size_mb: 250,
    max_ai_tokens: 30000,
    max_workspaces: 1,
    features: [
      "1 workspace",
      "Basic transaction tracking",
      "30,000 AI tokens / month",
      "Secure vault storage (250MB)",
      "Standard support",
    ],
    is_active: true,
  },
  {
    name: "Pro",
    description: "Built for founders and small teams that need room to scale.",
    prices: [
      {
        currency: "usd",
        monthly: 999,
        yearly: 9990,
        mayar_monthly_id: "PRO_MONTHLY_USD",
        mayar_yearly_id: "PRO_YEARLY_USD",
      },
      {
        currency: "eur",
        monthly: 899,
        yearly: 8990,
        mayar_monthly_id: "PRO_MONTHLY_EUR",
        mayar_yearly_id: "PRO_YEARLY_EUR",
      },
      {
        currency: "idr",
        monthly: 149000,
        yearly: 1490000,
        mayar_monthly_id: "PRO_MONTHLY_IDR",
        mayar_yearly_id: "PRO_YEARLY_IDR",
      },
    ],
    max_vault_size_mb: 15360, // 15GB
    max_ai_tokens: 400000,
    max_workspaces: 10,
    features: [
      "10 workspaces",
      "Unlimited wallets",
      "Advanced analytics",
      "Unlimited transactions",
      "400,000 AI tokens included monthly",
      "Custom categories",
      "Invoice & exports",
      "Priority email support",
    ],
    is_active: true,
  },
  {
    name: "Business",
    description: "For growing teams that need high limits and operational control.",
    prices: [
      {
        currency: "usd",
        monthly: 3899,
        yearly: 38990,
        mayar_monthly_id: "BUSINESS_MONTHLY_USD",
        mayar_yearly_id: "BUSINESS_YEARLY_USD",
      },
      {
        currency: "eur",
        monthly: 3499,
        yearly: 34990,
        mayar_monthly_id: "BUSINESS_MONTHLY_EUR",
        mayar_yearly_id: "BUSINESS_YEARLY_EUR",
      },
      {
        currency: "idr",
        monthly: 649000,
        yearly: 6490000,
        mayar_monthly_id: "BUSINESS_MONTHLY_IDR",
        mayar_yearly_id: "BUSINESS_YEARLY_IDR",
      },
    ],
    max_vault_size_mb: 51200, // 50GB
    max_ai_tokens: 1500000,
    max_workspaces: 250, // Effectively unlimited (ui labels as unlimited)
    features: [
      "Unlimited workspaces",
      "Unlimited wallets",
      "1,500,000 AI tokens included monthly",
      "Full collaboration features",
      "Custom roles & permissions",
      "Audit logs",
      "API access",
      "Dedicated support",
    ],
    is_active: true,
  },
];

const ADDONS = [
  {
    name: "AI Token Pack (Small)",
    description: "Extra 1,500,000 AI tokens for your workspace every month.",
    prices: [
      {
        currency: "usd",
        monthly: 799,
        yearly: 7990,
        mayar_product_id: "AI_SMALL_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 749,
        yearly: 7490,
        mayar_product_id: "AI_SMALL_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 129000,
        yearly: 1290000,
        mayar_product_id: "AI_SMALL_PROD_IDR",
      },
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
      {
        currency: "usd",
        monthly: 1999,
        yearly: 19990,
        mayar_product_id: "AI_LARGE_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 1899,
        yearly: 18990,
        mayar_product_id: "AI_LARGE_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 329000,
        yearly: 3290000,
        mayar_product_id: "AI_LARGE_PROD_IDR",
      },
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
    name: "Storage Pack (Small)",
    description: "Extra 25 GB secure storage for your vault every month.",
    prices: [
      {
        currency: "usd",
        monthly: 299,
        yearly: 2990,
        mayar_product_id: "VAULT_SMALL_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 299,
        yearly: 2990,
        mayar_product_id: "VAULT_SMALL_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 49000,
        yearly: 490000,
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
        monthly: 899,
        yearly: 8990,
        mayar_product_id: "VAULT_LARGE_PROD_USD",
      },
      {
        currency: "eur",
        monthly: 849,
        yearly: 8490,
        mayar_product_id: "VAULT_LARGE_PROD_EUR",
      },
      {
        currency: "idr",
        monthly: 149000,
        yearly: 1490000,
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
] satisfies (typeof pricing.$inferInsert)[];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  console.log("🌱 Seeding pricing plans…\n");

  for (const plan of [...PLANS, ...ADDONS]) {
    // Check if a plan with the same name already exists (case-insensitive)
    const existing = await db.execute(
      sql`SELECT id FROM pricing WHERE lower(name) = lower(${plan.name}) AND deleted_at IS NULL LIMIT 1`,
    );

    if (existing.length > 0) {
      console.log(
        `⏭  Skipped: "${plan.name}" already exists (id: ${existing[0]!.id})`,
      );
      // Update the existing plan to ensure it has the correct flags
      await db.update(pricing).set(plan).where(eq(pricing.id, (existing[0] as any).id));
      console.log(`✅ Updated flags for: "${plan.name}"`);
      continue;
    }

    const [inserted] = await db
      .insert(pricing)
      .values(plan)
      .returning({ id: pricing.id, name: pricing.name });

    console.log(`✅ Inserted: "${inserted!.name}" (id: ${inserted!.id})`);
  }

  console.log("\n✨ Done.");
  await client.end();
}

main().catch((err) => {
  console.error("❌ Seeder failed:", err);
  process.exit(1);
});
