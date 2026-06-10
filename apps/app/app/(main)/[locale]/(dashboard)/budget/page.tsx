import { getBudgetStatus } from "@workspace/modules/server";
import type { Metadata } from "next";

import { BudgetClient } from "@/components/organisms/budgets/budget-client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Budget",
};

export const dynamic = "force-dynamic";

export default async function BudgetPage(props: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;

  const month = Number(searchParams.month) || undefined;
  const year = Number(searchParams.year) || undefined;

  const [budgetRes, dictionary] = await Promise.all([
    getBudgetStatus({ month, year }),
    getDictionary(locale),
  ]);

  const budgetStatus = Array.isArray(budgetRes?.data) ? budgetRes.data : [];

  return (
    <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
      <div className="no-scrollbar min-h-0 flex-1">
        <BudgetClient
          initialData={budgetStatus}
          dictionary={dictionary as unknown as Record<string, string>}
          locale={locale}
        />
      </div>
    </div>
  );
}
