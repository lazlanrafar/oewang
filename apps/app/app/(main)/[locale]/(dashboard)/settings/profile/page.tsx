import type { Metadata } from "next";

import { SettingProfileForm } from "@/components/organisms/setting/profile/setting-profile-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Profile | Settings",
};

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function SettingsProfilePage({ params }: Props) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);

  return (
    <div className="space-y-6">
      <SettingProfileForm dictionary={dictionary} />
    </div>
  );
}
