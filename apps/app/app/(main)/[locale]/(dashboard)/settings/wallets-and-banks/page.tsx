import type { Metadata } from "next";

import { WalletClient } from "@/components/organisms/setting/wallet/wallet-client";
import { Hydrated } from "@/components/shared/hydrated";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Wallets & Banks | Settings",
};

interface SettingsWalletsPageProps {
  params: Promise<{
    locale: Locale;
  }>;
}

export default async function SettingsWalletsPage({ params }: SettingsWalletsPageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <Hydrated>
      <WalletClient dictionary={dictionary} />
    </Hydrated>
  );
}
