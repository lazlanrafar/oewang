import { Suspense } from "react";
import { CalendarClient } from "@/components/organisms/calendar/calendar-client";
import { Locale } from "@/i18n-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Calendar",
};

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function CalendarPage({ params }: PageProps) {
  const { locale } = await params;

  return (
    <div className="flex-1 flex flex-col">
      <Suspense fallback={<div>Loading calendar...</div>}>
        <CalendarClient />
      </Suspense>
    </div>
  );
}
