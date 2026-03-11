import React from "react";

import { AppearanceForm } from "@/components/organisms/setting/appearance/appearance-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

interface Props {
  params: Promise<{
    locale: Locale;
  }>;
}

export default async function SettingAppearancePage({ params }: Props) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return <AppearanceForm dictionary={dictionary} />;
}
