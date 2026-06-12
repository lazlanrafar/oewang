import type { Metadata } from "next";

import { CalendarClient } from "@/components/organisms/calendar/calendar-client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Calendar",
};

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <div className="flex flex-1 flex-col">
      <CalendarClient dictionary={dictionary} />
    </div>
  );
}
