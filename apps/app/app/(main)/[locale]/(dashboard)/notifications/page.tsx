import type { Metadata } from "next";

import { NotificationList } from "@/components/organisms/notification/notification-list";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Notifications",
};

export default async function NotificationsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
      <div className="no-scrollbar min-h-0 flex-1">
        <div className="">
          <div>
            <h1 className="font-semibold text-lg tracking-tight">{dictionary.notifications.title}</h1>
            <p className="text-muted-foreground text-sm">{dictionary.notifications.description}</p>
          </div>
          <div className="mx-auto mt-4 max-w-2xl">
            <NotificationList dictionary={dictionary} />
          </div>
        </div>
      </div>
    </div>
  );
}
