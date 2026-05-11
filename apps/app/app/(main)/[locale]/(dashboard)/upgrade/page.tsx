import { getPricing } from "@workspace/modules/pricing/pricing.action";
import type { Metadata } from "next";

import { UpgradeView } from "@/components/organisms/setting/upgrade/upgrade-view";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Upgrade",
};

export default async function UpgradePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);
  const pricingResult = await getPricing({ is_addon: "false" });

  const plans = pricingResult.success ? (pricingResult.data?.pricingList ?? []) : [];

  return (
    <div className="space-y-6">
      <UpgradeView initialPlans={plans} locale={locale} dictionary={dictionary} />
    </div>
  );
}
