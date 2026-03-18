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
import { sql } from "drizzle-orm";
import { pricing } from "../schema/pricing";

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
    max_ai_tokens: 500,
    features: [
      "1 workspace",
      "Up to 3 wallets",
      "Basic transaction tracking",
      "100 transactions / month",
      "Email support",
    ],
    is_active: true,
  },
  {
    name: "Pro",
    description: "Everything you need to run a growing business.",
    prices: [
      { currency: "usd", monthly: 1200, yearly: 11520 },
      { currency: "eur", monthly: 1100, yearly: 10560 },
      { currency: "idr", monthly: 180000, yearly: 1728000 },
    ],
    max_vault_size_mb: 2048,
    max_ai_tokens: 10000,
    features: [
      "3 workspaces",
      "Unlimited wallets",
      "Advanced analytics",
      "Unlimited transactions",
      "Invoice & exports",
      "Priority email support",
    ],
    is_active: true,
  },
  {
    name: "Business",
    description: "For teams that need full control and collaboration.",
    prices: [
      { currency: "usd", monthly: 3900, yearly: 37440 },
      { currency: "eur", monthly: 3600, yearly: 34560 },
      { currency: "idr", monthly: 585000, yearly: 5616000 },
    ],
    max_vault_size_mb: 10240,
    max_ai_tokens: 50000,
    features: [
      "Unlimited workspaces",
      "Unlimited wallets",
      "Custom categories & reports",
      "Team members & roles",
      "Audit logs",
      "Dedicated support",
    ],
    is_active: true,
  },
] satisfies (typeof pricing.$inferInsert)[];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  console.log("🌱 Seeding pricing plans…\n");

  for (const plan of PLANS) {
    // Check if a plan with the same name already exists (case-insensitive)
    const existing = await db.execute(
      sql`SELECT id FROM pricing WHERE lower(name) = lower(${plan.name}) AND deleted_at IS NULL LIMIT 1`,
    );

    if (existing.length > 0) {
      console.log(
        `⏭  Skipped: "${plan.name}" already exists (id: ${existing[0]!.id})`,
      );
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
