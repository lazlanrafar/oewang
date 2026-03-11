import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

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
