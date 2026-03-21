import { SettingProfileForm } from "@/components/organisms/setting/profile/setting-profile-form";

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function SettingsProfilePage({ params }: Props) {
  return (
    <div className="space-y-6">
      <SettingProfileForm />
    </div>
  );
}
