import { Separator } from "@workspace/ui";

import {
  getSubCurrencies,
  getTransactionSettings,
} from "@workspace/modules/server";
import { MainCurrencyForm } from "@/components/organisms/setting/main-currency/main-currency-form";
import { SubCurrencyList } from "@/components/organisms/setting/sub-currency/sub-currency-list";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

interface CurrencyPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export default async function CurrencyPage({ params }: CurrencyPageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);
  const settingsResult = await getTransactionSettings();
  const subCurrenciesResult = await getSubCurrencies();

  const settings = settingsResult.success ? settingsResult.data : null;
  const subCurrencies = subCurrenciesResult.success
    ? subCurrenciesResult.data
    : [];

  if (!settings) {
    // Should handle this better, but for now just return empty or error
    return <div>Failed to load settings</div>;
  }

  return (
    <div className="space-y-6">
      <MainCurrencyForm settings={settings} dictionary={dictionary} />

      <Separator />

      <SubCurrencyList
        initialSubCurrencies={subCurrencies}
        settings={settings}
        dictionary={dictionary}
      />
    </div>
  );
}
