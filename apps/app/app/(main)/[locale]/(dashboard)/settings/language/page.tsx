import React from "react";

import { LanguageSettingsForm } from "@/components/organisms/setting/language/language-settings-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

interface Props {
  params: Promise<{
    locale: Locale;
  }>;
}

export default async function SettingLanguagePage({ params }: Props) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <div className="space-y-6">
      <LanguageSettingsForm currentLocale={locale} dictionary={dictionary} />
    </div>
  );
}
