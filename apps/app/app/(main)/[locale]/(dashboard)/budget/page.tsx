import { Suspense } from "react";

import { getBudgetStatus } from "@workspace/modules/server";
import type { Metadata } from "next";

import { BudgetClient } from "@/components/organisms/budgets/budget-client";
import { BudgetSkeleton } from "@/components/organisms/budgets/budget-skeleton";
import { Hydrated } from "@/components/shared/hydrated";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Budget",
};

export default async function BudgetPage(props: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;

  return (
    <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
      <div className="no-scrollbar min-h-0 flex-1">
        <Suspense fallback={<BudgetSkeleton />}>
          <BudgetPageContent locale={locale} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function BudgetPageContent({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const month = Number(searchParams.month) || undefined;
  const year = Number(searchParams.year) || undefined;

  // Get initial data for SSR
  const [budgetRes, dictionary] = await Promise.all([getBudgetStatus({ month, year }), getDictionary(locale)]);

  const budgetStatus = Array.isArray(budgetRes?.data) ? budgetRes.data : [];

  return (
    <Hydrated fallback={<BudgetSkeleton />}>
      <BudgetClient initialData={budgetStatus} dictionary={dictionary} locale={locale} />
    </Hydrated>
  );
}
