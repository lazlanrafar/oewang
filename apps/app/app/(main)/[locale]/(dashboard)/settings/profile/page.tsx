import { Separator } from "@workspace/ui";

import { SettingProfileForm } from "@/components/organisms/setting/profile/setting-profile-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

interface Props {
  params: Promise<{
    locale: Locale;
  }>;
}

export default async function SettingsProfilePage({ params }: Props) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const { profile } = dictionary.settings;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{profile.title}</h3>
        <p className="text-muted-foreground text-sm">{profile.description}</p>
      </div>
      <Separator />
      <SettingProfileForm dictionary={dictionary} />
    </div>
  );
}
