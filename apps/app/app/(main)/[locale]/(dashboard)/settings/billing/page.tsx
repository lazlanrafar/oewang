import { getPricing } from "@workspace/modules/pricing/pricing.action";
import type { Metadata } from "next";

import { BillingView } from "@/components/organisms/setting/billing/billing-view";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { requireSensitiveWorkspaceAccess } from "@/lib/workspace-permissions.server";

export const metadata: Metadata = {
  title: "Billing | Settings",
};

export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireSensitiveWorkspaceAccess(locale);
  // Independent fetches after the auth gate — run them in parallel.
  const [dictionary, pricingResult, addonsResult] = await Promise.all([
    getDictionary(locale as Locale),
    getPricing({ is_addon: "false" }),
    getPricing({ is_addon: "true" }),
  ]);

  const plans = pricingResult.success ? (pricingResult.data?.pricingList ?? []) : [];

  const addons = addonsResult.success ? (addonsResult.data?.pricingList ?? []) : [];

  return (
    <div className="space-y-6">
      <BillingView initialPlans={plans} initialAddons={addons} dictionary={dictionary} />
    </div>
  );
}
