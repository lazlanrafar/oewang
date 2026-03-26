import { BillingView } from "@/components/organisms/setting/billing/billing-view";
import { getPricing } from "@workspace/modules/pricing/pricing.action";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing | Settings",
};

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const pricingResult = await getPricing({ is_addon: "false" });
  const addonsResult = await getPricing({ is_addon: "true" });

  const plans = pricingResult.success
    ? (pricingResult.data?.pricingList ?? [])
    : [];
    
  const addons = addonsResult.success
    ? (addonsResult.data?.pricingList ?? [])
    : [];

  return (
    <div className="space-y-6">
      <BillingView initialPlans={plans} initialAddons={addons} />
    </div>
  );
}

