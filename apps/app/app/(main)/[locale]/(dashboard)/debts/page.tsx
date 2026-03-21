import { Suspense } from "react";
import type { Wallet } from "@workspace/types";
import { getWallets, getDebts, type DebtWithContact } from "@workspace/modules/server";
import { DebtsClient } from "@/components/organisms/debts/debts-client";
import { DebtTableSkeleton } from "@/components/organisms/debts/debt-table-skeleton";
import { getDictionary } from "@/get-dictionary";
import { Locale } from "@/i18n-config";

export const dynamic = "force-dynamic";

export default async function DebtsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col bg-background no-scrollbar">
      <div className="flex-1 min-h-0 no-scrollbar">
        <Suspense fallback={<DebtTableSkeleton />}>
          <DebtsPageContent locale={(await params).locale} />
        </Suspense>
      </div>
    </div>
  );
}

async function DebtsPageContent({ locale }: { locale: Locale }) {
  const dictionary = await getDictionary(locale);
  let initialDebts: DebtWithContact[] = [];
  let initialWallets: Wallet[] = [];

  try {
    const [debtsRes, walletsRes] = await Promise.all([
      getDebts(),
      getWallets(),
    ]);

    if (debtsRes?.success && debtsRes?.data) {
      initialDebts = debtsRes.data;
    }

    if (walletsRes?.success && walletsRes?.data) {
      initialWallets = walletsRes.data;
    }
  } catch (error) {
    console.error("Failed to fetch initial data for debts page:", error);
  }

  return (
    <DebtsClient
      initialData={initialDebts}
      wallets={initialWallets}
      dictionary={dictionary}
    />
  );
}
