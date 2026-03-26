import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wallets & Banks | Settings",
};

interface SettingsWalletsPageProps {
  params: {
    locale: Locale;
  };
}

export default async function SettingsWalletsPage({
  params,
}: SettingsWalletsPageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <div className="space-y-6">
      <p>Wallet</p>
    </div>
  );
}
