import * as path from "node:path";
import * as dotenv from "dotenv";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pricing } from "../../schema/pricing";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
}

const PLANS = [
  {
    name: "Starter",
    description: "Start tracking daily spending for free with simple limits.",
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
      "Daily transaction tracking",
      "30,000 AI tokens / month",
      "Secure vault storage (250MB)",
      "Standard support",
    ],
    is_active: true,
    is_addon: false,
    addon_type: null,
  },
  {
    name: "Personal",
    description:
      "Best-value plan for daily personal money tracking in Indonesia.",
    prices: [
      {
        currency: "usd",
        monthly: 500,
        yearly: 4800,
        mayar_monthly_id: "PERSONAL_MONTHLY_USD",
        mayar_yearly_id: "PERSONAL_YEARLY_USD",
      },
      {
        currency: "eur",
        monthly: 500,
        yearly: 4800,
        mayar_monthly_id: "PERSONAL_MONTHLY_EUR",
        mayar_yearly_id: "PERSONAL_YEARLY_EUR",
      },
      {
        currency: "idr",
        monthly: 39900,
        yearly: 383000,
        mayar_monthly_id: "PERSONAL_MONTHLY_IDR",
        mayar_yearly_id: "PERSONAL_YEARLY_IDR",
      },
    ],
    max_vault_size_mb: 2048,
    max_ai_tokens: 100000,
    max_workspaces: 3,
    features: [
      "3 workspaces",
      "Unlimited wallets",
      "Daily spending insights",
      "100,000 AI tokens included monthly",
      "Receipt vault storage (2GB)",
      "Best value for personal tracking",
    ],
    is_active: true,
    is_addon: false,
    addon_type: null,
  },
  {
    name: "Pro",
    description:
      "For families, freelancers, and power users tracking more activity.",
    prices: [
      {
        currency: "usd",
        monthly: 1200,
        yearly: 11500,
        mayar_monthly_id: "PRO_MONTHLY_USD",
        mayar_yearly_id: "PRO_YEARLY_USD",
      },
      {
        currency: "eur",
        monthly: 1100,
        yearly: 10600,
        mayar_monthly_id: "PRO_MONTHLY_EUR",
        mayar_yearly_id: "PRO_YEARLY_EUR",
      },
      {
        currency: "idr",
        monthly: 99900,
        yearly: 959000,
        mayar_monthly_id: "PRO_MONTHLY_IDR",
        mayar_yearly_id: "PRO_YEARLY_IDR",
      },
    ],
    max_vault_size_mb: 15360,
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
    is_addon: false,
    addon_type: null,
  },
  {
    name: "Business",
    description:
      "For small teams that need shared tracking and operational control.",
    prices: [
      {
        currency: "usd",
        monthly: 2900,
        yearly: 27800,
        mayar_monthly_id: "BUSINESS_MONTHLY_USD",
        mayar_yearly_id: "BUSINESS_YEARLY_USD",
      },
      {
        currency: "eur",
        monthly: 2700,
        yearly: 25900,
        mayar_monthly_id: "BUSINESS_MONTHLY_EUR",
        mayar_yearly_id: "BUSINESS_YEARLY_EUR",
      },
      {
        currency: "idr",
        monthly: 249900,
        yearly: 2399000,
        mayar_monthly_id: "BUSINESS_MONTHLY_IDR",
        mayar_yearly_id: "BUSINESS_YEARLY_IDR",
      },
    ],
    max_vault_size_mb: 51200,
    max_ai_tokens: 1500000,
    max_workspaces: 250,
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
    is_addon: false,
    addon_type: null,
  },
];

export async function seedPlans() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  console.log("🌱 Seeding subscription plans...");

  for (const plan of PLANS) {
    const [existing] = await db
      .select({ id: pricing.id })
      .from(pricing)
      .where(
        and(
          sql`lower(${pricing.name}) = lower(${plan.name})`,
          isNull(pricing.deleted_at),
        ),
      )
      .limit(1);

    if (existing) {
      await db.update(pricing).set(plan).where(eq(pricing.id, existing.id));
      console.log(`  ↻  Updated: "${plan.name}"`);
    } else {
      const [inserted] = await db
        .insert(pricing)
        .values(plan)
        .returning({ id: pricing.id, name: pricing.name });
      console.log(`  ✓  Inserted: "${inserted!.name}"`);
    }
  }

  await client.end();
  console.log("✅ Plans seeded.\n");
}

if (process.argv[1]?.endsWith("01-plans.ts")) {
  seedPlans().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
  });
}
