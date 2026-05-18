import type { Metadata } from "next";

import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { NotificationList } from "@/components/organisms/notification/notification-list";

export const metadata: Metadata = {
  title: "Notifications",
};

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
      <div className="no-scrollbar min-h-0 flex-1">
        <div className="">
          <div>
            <h1 className="font-semibold text-lg tracking-tight">
              Notifications
            </h1>
            <p className="text-muted-foreground text-sm">
              Your recent activity and alerts.
            </p>
          </div>
          <div className="mt-4 mx-auto max-w-2xl">
            <NotificationList dictionary={dictionary} />
          </div>
        </div>
      </div>
    </div>
  );
}
