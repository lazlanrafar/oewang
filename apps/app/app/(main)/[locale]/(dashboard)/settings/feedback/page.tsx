import type { Metadata } from "next";

import { SettingFeedbackForm } from "@/components/organisms/setting/feedback/setting-feedback-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Feedback | Settings",
};

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function SettingFeedbackPage({ params }: Props) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);

  return <SettingFeedbackForm dictionary={dictionary} />;
}
