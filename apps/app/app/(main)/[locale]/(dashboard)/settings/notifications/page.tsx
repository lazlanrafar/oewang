import { NotificationSettings } from "@/components/organisms/setting/notification-settings";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications | Settings",
};

export default async function NotificationsSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as any);

  return <NotificationSettings />;
}
