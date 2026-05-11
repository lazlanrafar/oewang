import type { Metadata } from "next";

import { LanguageSettingsForm } from "@/components/organisms/setting/language/language-settings-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Language | Settings",
};

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function SettingLanguagePage({ params }: Props) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);

  return (
    <div className="space-y-6">
      <LanguageSettingsForm dictionary={dictionary} />
    </div>
  );
}
