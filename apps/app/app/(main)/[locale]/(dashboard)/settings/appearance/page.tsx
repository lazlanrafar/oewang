import type { Metadata } from "next";

import { AppearanceForm } from "@/components/organisms/setting/appearance/appearance-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Appearance | Settings",
};

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function SettingAppearancePage({ params }: Props) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);

  return <AppearanceForm dictionary={dictionary} />;
}
