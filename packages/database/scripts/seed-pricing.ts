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
    description: "Get started with the essentials. No credit card required.",
    prices: [
      { currency: "usd", monthly: 0, yearly: 0 },
      { currency: "eur", monthly: 0, yearly: 0 },
      { currency: "idr", monthly: 0, yearly: 0 },
    ],
    max_vault_size_mb: 100,
    max_ai_tokens: 5000,
    max_workspaces: 1,
    features: [
      "1 workspace",
      "Basic transaction tracking",
      "5,000 AI tokens / month",
      "Limited storage (100MB)",
      "Standard support",
    ],
    is_active: true,
  },
  {
    name: "Pro",
    description: "Everything you need to run a growing business.",
    prices: [
      {
        currency: "usd",
        monthly: 1900,
        yearly: 19000,
        xendit_monthly_id: "PRO_MONTHLY_USD",
        xendit_yearly_id: "PRO_YEARLY_USD",
      },
      {
        currency: "eur",
        monthly: 1900,
        yearly: 19000,
        xendit_monthly_id: "PRO_MONTHLY_EUR",
        xendit_yearly_id: "PRO_YEARLY_EUR",
      },
      {
        currency: "idr",
        monthly: 149000,
        yearly: 1490000,
        xendit_monthly_id: "PRO_MONTHLY_IDR",
        xendit_yearly_id: "PRO_YEARLY_IDR",
      },
    ],
    max_vault_size_mb: 5120, // 5GB
    max_ai_tokens: 50000,
    max_workspaces: 5,
    features: [
      "5 workspaces",
      "Unlimited wallets",
      "Advanced analytics",
      "Unlimited transactions",
      "Custom categories",
      "Invoice & exports",
      "Priority email support",
    ],
    is_active: true,
  },
  {
    name: "Business",
    description: "For teams that need full control and collaboration.",
    prices: [
      {
        currency: "usd",
        monthly: 5900,
        yearly: 59000,
        xendit_monthly_id: "BUSINESS_MONTHLY_USD",
        xendit_yearly_id: "BUSINESS_YEARLY_USD",
      },
      {
        currency: "eur",
        monthly: 5900,
        yearly: 59000,
        xendit_monthly_id: "BUSINESS_MONTHLY_EUR",
        xendit_yearly_id: "BUSINESS_YEARLY_EUR",
      },
      {
        currency: "idr",
        monthly: 499000,
        yearly: 4990000,
        xendit_monthly_id: "BUSINESS_MONTHLY_IDR",
        xendit_yearly_id: "BUSINESS_YEARLY_IDR",
      },
    ],
    max_vault_size_mb: 20480, // 20GB
    max_ai_tokens: 250000,
    max_workspaces: 100, // Effectively unlimited (ui labels as unlimited)
    features: [
      "Unlimited workspaces",
      "Unlimited wallets",
      "Full cooperation features",
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
    description: "Extra 500,000 AI tokens for your workspace every month.",
    prices: [
      {
        currency: "usd",
        monthly: 1000,
        yearly: 10000,
        xendit_product_id: "AI_SMALL_PROD_USD",
      },
      {
        currency: "idr",
        monthly: 155000,
        yearly: 1550000,
        xendit_product_id: "AI_SMALL_PROD_IDR",
      },
    ],
    max_vault_size_mb: 0,
    max_ai_tokens: 500000,
    max_workspaces: 0,
    features: ["+500,000 AI tokens monthly"],
    is_active: true,
    is_addon: true,
    addon_type: "ai",
  },
  {
    name: "AI Token Pack (Large)",
    description: "Extra 1,000,000 AI tokens for your workspace every month.",
    prices: [
      {
        currency: "usd",
        monthly: 1800,
        yearly: 18000,
        xendit_product_id: "AI_LARGE_PROD_USD",
      },
      {
        currency: "idr",
        monthly: 279000,
        yearly: 2790000,
        xendit_product_id: "AI_LARGE_PROD_IDR",
      },
    ],
    max_vault_size_mb: 0,
    max_ai_tokens: 1000000,
    max_workspaces: 0,
    features: ["+1,000,000 AI tokens monthly"],
    is_active: true,
    is_addon: true,
    addon_type: "ai",
  },
  {
    name: "Storage Pack (Small)",
    description: "Extra 5 GB secure storage for your vault every month.",
    prices: [
      {
        currency: "usd",
        monthly: 500,
        yearly: 5000,
        xendit_product_id: "VAULT_SMALL_PROD_USD",
      },
      {
        currency: "idr",
        monthly: 75000,
        yearly: 750000,
        xendit_product_id: "VAULT_SMALL_PROD_IDR",
      },
    ],
    max_vault_size_mb: 5120,
    max_ai_tokens: 0,
    max_workspaces: 0,
    features: ["+5 GB vault storage monthly"],
    is_active: true,
    is_addon: true,
    addon_type: "vault",
  },
  {
    name: "Storage Pack (Large)",
    description: "Extra 20 GB secure storage for your vault every month.",
    prices: [
      {
        currency: "usd",
        monthly: 1500,
        yearly: 15000,
        xendit_product_id: "VAULT_LARGE_PROD_USD",
      },
      {
        currency: "idr",
        monthly: 229000,
        yearly: 2290000,
        xendit_product_id: "VAULT_LARGE_PROD_IDR",
      },
    ],
    max_vault_size_mb: 20480,
    max_ai_tokens: 0,
    max_workspaces: 0,
    features: ["+20 GB vault storage monthly"],
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
