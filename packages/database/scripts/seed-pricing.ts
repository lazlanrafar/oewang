import { db } from "../client";
import { pricing } from "../schema/pricing";

async function main() {
  console.log("🌱 Seeding pricing packages...");

  await db.transaction(async (tx) => {
    // Free Tier
    await tx.insert(pricing).values({
      name: "Free Tier",
      description: "Basic features for personal use.",
      price_monthly: 0,
      price_yearly: 0,
      currency: "usd",
      features: ["1 Workspace", "Basic Reporting", "Limited AI Tokens"],
      max_vault_size_mb: 50,
      max_ai_tokens: 50,
      is_active: true,
    });

    // Basic Tier (Monthly & Yearly)
    await tx.insert(pricing).values({
      name: "Basic Tier",
      description: "Perfect for individuals just getting started.",
      price_monthly: 900, // $9.00
      price_yearly: 9000, // $90.00
      currency: "usd",
      features: ["1 Workspace", "Basic Reporting", "Community Support"],
      max_vault_size_mb: 500,
      max_ai_tokens: 1000,
      is_active: true,
    });

    // Pro Tier (Monthly & Yearly)
    await tx.insert(pricing).values({
      name: "Pro Tier",
      description: "Ideal for growing teams and small businesses.",
      price_monthly: 2900, // $29.00
      price_yearly: 29000, // $290.00
      currency: "usd",
      features: [
        "5 Workspaces",
        "Advanced Analytics",
        "Priority Email Support",
        "Custom Exports",
      ],
      max_vault_size_mb: 2048, // 2GB
      max_ai_tokens: 10000,
      is_active: true,
    });

    // Enterprise Tier (Monthly & Yearly)
    await tx.insert(pricing).values({
      name: "Enterprise Tier",
      description:
        "For large organizations that need maximum power and security.",
      price_monthly: 9900, // $99.00
      price_yearly: 99000, // $990.00
      currency: "usd",
      features: [
        "Unlimited Workspaces",
        "Custom AI Models",
        "24/7 Phone Support",
        "Dedicated Account Manager",
        "SSO Authentication",
      ],
      max_vault_size_mb: 10240, // 10GB
      max_ai_tokens: 100000,
      is_active: true,
    });

    // Lifetime Tier (One-time)
    await tx.insert(pricing).values({
      name: "Lifetime Access",
      description: "Pay once and own the software forever.",
      price_one_time: 49900, // $499.00
      currency: "usd",
      features: [
        "All Pro Features",
        "Lifetime Updates",
        "Exclusive Early Access",
      ],
      max_vault_size_mb: 5120, // 5GB
      max_ai_tokens: 50000,
      is_active: true,
    });
  });

  console.log("✅ Pricing packages seeded successfully!");
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ Seeding failed:", error);
  process.exit(1);
});
