import { Suspense } from "react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Debts",
};

import { type DebtWithContact, getDebts, getTransactionSettings, getWallets } from "@workspace/modules/server";
import type { TransactionSettings, Wallet } from "@workspace/types";

import { DebtTableSkeleton } from "@/components/organisms/debts/debt-table-skeleton";
import { DebtsClient } from "@/components/organisms/debts/debts-client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const dynamic = "force-dynamic";

export default async function DebtsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  return (
    <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
      <div className="no-scrollbar min-h-0 flex-1">
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
  let settings: TransactionSettings | null = null;

  try {
    const [debtsRes, walletsRes, settingsRes] = await Promise.all([getDebts(), getWallets(), getTransactionSettings()]);

    if (debtsRes?.success && debtsRes?.data) {
      initialDebts = debtsRes.data;
    }

    if (walletsRes?.success && walletsRes?.data) {
      initialWallets = walletsRes.data;
    }

    if (settingsRes?.success && settingsRes?.data) {
      settings = settingsRes.data;
    }
  } catch (error) {
    console.error("Failed to fetch initial data for debts page:", error);
  }

  return (
    <DebtsClient initialData={initialDebts} wallets={initialWallets} dictionary={dictionary} settings={settings} />
  );
}
