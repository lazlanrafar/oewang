import { Suspense } from "react";

import { getTransactionSettings } from "@workspace/modules/server";
import type { TransactionSettings } from "@workspace/types";
import type { Metadata } from "next";

import { CalendarClient } from "@/components/organisms/calendar/calendar-client";
import { Hydrated } from "@/components/shared/hydrated";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Calendar",
};

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function CalendarPage({ params }: PageProps) {
  const { locale } = await params;
  const [dictionary, settingsRes] = await Promise.all([getDictionary(locale), getTransactionSettings()]);

  const settings =
    settingsRes.success && settingsRes.data
      ? settingsRes.data
      : ({
          monthlyStartDate: 1,
          monthlyStartDateWeekendHandling: "no-changes",
          weeklyStartDay: "monday",
          period: "monthly",
          startScreen: "daily",
          incomeExpensesColor: "blue-red",
          carryOver: false,
          autocomplete: true,
          timeInput: "time",
          swipeAction: "delete",
          inputOrder: "amount",
          showDescription: true,
          noteButton: true,
          mainCurrencyCode: "USD",
          mainCurrencySymbol: "$",
          mainCurrencySymbolPosition: "Front",
          mainCurrencyDecimalPlaces: 2,
        } as TransactionSettings);

  return (
    <div className="flex flex-1 flex-col">
      <Hydrated>
        <Suspense fallback={<div>Loading calendar...</div>}>
          <CalendarClient dictionary={dictionary} settings={settings} />
        </Suspense>
      </Hydrated>
    </div>
  );
}
