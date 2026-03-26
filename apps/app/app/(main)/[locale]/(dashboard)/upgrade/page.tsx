import { UpgradeView } from "@/components/organisms/setting/upgrade/upgrade-view";
import { getPricing } from "@workspace/modules/pricing/pricing.action";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upgrade",
};

export default async function UpgradePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;
  const pricingResult = await getPricing({ is_addon: "false" });

  const plans = pricingResult.success
    ? (pricingResult.data?.pricingList ?? [])
    : [];

  return (
    <div className="space-y-6">
      <UpgradeView initialPlans={plans} />
    </div>
  );
}
