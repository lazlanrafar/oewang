import type { Metadata } from "next";

import { TransactionSettingsForm } from "@/components/organisms/setting/transaction/transaction-settings-form";
import { Hydrated } from "@/components/shared/hydrated";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Transactions | Settings",
};

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function SettingTransactionPage({ params }: Props) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);

  return (
    <Hydrated>
      <TransactionSettingsForm dictionary={dictionary} />
    </Hydrated>
  );
}
