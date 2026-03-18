import { db } from "../client";
import { pricing } from "../schema/pricing";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import "dotenv/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-12-18.acacia" as any, // Bypass TS error for unknown API versions
});

async function main() {
  console.log("🚀 Setting up Stripe products and prices...");

  const plans = await db
    .select()
    .from(pricing)
    .where(eq(pricing.is_active, true));

  for (const plan of plans) {
    const hasPrices = plan.prices && plan.prices.some(p => p.monthly > 0 || p.yearly > 0);
    if (!hasPrices) {
      console.log(`\n⏭  Skipping free plan: ${plan.name}`);
      continue;
    }

    console.log(`\n📦 Processing plan: ${plan.name}`);

    // Create or retrieve product
    let productId = plan.stripe_product_id;
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description || undefined,
      });
      productId = product.id;
      console.log(`  ✅ Created Stripe Product: ${productId}`);
    } else {
      console.log(`  ✅ Using existing Product: ${productId}`);
    }

    let updatedPrices = [];

    // Create Prices for each currency
    for (const priceObj of plan.prices || []) {
      const { currency, monthly, yearly } = priceObj;
      let stripe_monthly_id = priceObj.stripe_monthly_id;
      let stripe_yearly_id = priceObj.stripe_yearly_id;

      // Create Monthly Price
      if (monthly > 0 && !stripe_monthly_id) {
        const price = await stripe.prices.create({
          product: productId,
          unit_amount: monthly,
          currency: currency.toLowerCase(),
          recurring: { interval: "month" },
        });
        stripe_monthly_id = price.id;
        console.log(
          `  ✅ Created Monthly Price (${currency.toUpperCase()}): ${stripe_monthly_id} ($${(monthly / 100).toFixed(2)})`,
        );
      }

      // Create Yearly Price
      if (yearly > 0 && !stripe_yearly_id) {
        const price = await stripe.prices.create({
          product: productId,
          unit_amount: yearly,
          currency: currency.toLowerCase(),
          recurring: { interval: "year" },
        });
        stripe_yearly_id = price.id;
        console.log(
          `  ✅ Created Yearly Price (${currency.toUpperCase()}): ${stripe_yearly_id} ($${(yearly / 100).toFixed(2)})`,
        );
      }

      updatedPrices.push({ ...priceObj, stripe_monthly_id, stripe_yearly_id });
    }

    // Update database
    await db
      .update(pricing)
      .set({
        stripe_product_id: productId,
        prices: updatedPrices,
      })
      .where(eq(pricing.id, plan.id));

    console.log(`  💾 Updated database for ${plan.name}`);
  }

  console.log("\n✨ Done! Stripe products and database are now in sync.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error setting up Stripe:", err);
  process.exit(1);
});
