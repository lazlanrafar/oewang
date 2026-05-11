import type { Metadata } from "next";

import { NotificationSettings } from "@/components/organisms/setting/notification-settings";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Notifications | Settings",
};

export default async function NotificationsSettingsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return <NotificationSettings dictionary={dictionary} />;
}
