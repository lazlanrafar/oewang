import { Separator } from "@workspace/ui";
import type { Metadata } from "next";

import { MainCurrencyForm } from "@/components/organisms/setting/main-currency/main-currency-form";
import { SubCurrencyList } from "@/components/organisms/setting/sub-currency/sub-currency-list";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Currency | Settings",
};

export default async function CurrencyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);

  // Settings + sub-currencies live in `useAppStore` — `AppProvider` fetches them
  // once at session start and the WebSocket invalidates the cache on changes.
  // Both components read directly from the store; no server fetch needed here.
  return (
    <div className="space-y-6">
      <MainCurrencyForm dictionary={dictionary} />
      <Separator />
      <SubCurrencyList dictionary={dictionary} />
    </div>
  );
}
