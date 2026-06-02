import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, eq } from "drizzle-orm";
import * as dotenv from "dotenv";
import * as path from "path";
import { pricing } from "../../schema/pricing";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
}

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
    is_addon: false,
    addon_type: null,
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
    const existing = await db.execute(
      sql`SELECT id FROM pricing WHERE lower(name) = lower(${plan.name}) AND deleted_at IS NULL LIMIT 1`,
    );

    if (existing.length > 0) {
      await db.update(pricing).set(plan).where(eq(pricing.id, (existing[0] as any).id));
      console.log(`  ↻  Updated: "${plan.name}"`);
    } else {
      const [inserted] = await db.insert(pricing).values(plan).returning({ id: pricing.id, name: pricing.name });
      console.log(`  ✓  Inserted: "${inserted!.name}"`);
    }
  }

  await client.end();
  console.log("✅ Plans seeded.\n");
}

// @ts-ignore - Bun supports import.meta.main at runtime
if (import.meta.main) {
  seedPlans().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
  });
}
