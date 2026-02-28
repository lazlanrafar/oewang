import { db } from "../client";
import { pricing } from "../schema/pricing";

async function main() {
  console.log("🌱 Seeding pricing packages...");

  await db.transaction(async (tx) => {
    // Basic Tier (Monthly & Yearly)
    await tx.insert(pricing).values({
      name: "Basic Tier",
      description: "Perfect for individuals just getting started.",
      price_monthly: 900, // $9.00
      price_yearly: 9000, // $90.00
      currency: "usd",
      features: ["1 Workspace", "Basic Reporting", "Community Support"],
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
