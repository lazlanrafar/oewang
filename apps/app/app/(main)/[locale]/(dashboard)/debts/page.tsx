import { type DebtWithContact, getDebts, getTransactionSettings, getWallets } from "@workspace/modules/server";
import type { TransactionSettings, Wallet } from "@workspace/types";
import type { Metadata } from "next";

import { DebtsClient } from "@/components/organisms/debts/debts-client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Debts",
};

export const dynamic = "force-dynamic";

export default async function DebtsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;

  let initialDebts: DebtWithContact[] = [];
  let initialWallets: Wallet[] = [];
  let settings: TransactionSettings | null = null;

  try {
    const [debtsRes, walletsRes, settingsRes, dictionary] = await Promise.all([
      getDebts(),
      getWallets(),
      getTransactionSettings(),
      getDictionary(locale),
    ]);

    if (debtsRes?.success && debtsRes?.data) initialDebts = debtsRes.data;
    if (walletsRes?.success && walletsRes?.data) initialWallets = walletsRes.data;
    if (settingsRes?.success && settingsRes?.data) settings = settingsRes.data;

    return (
      <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
        <div className="no-scrollbar min-h-0 flex-1">
          <DebtsClient
            initialData={initialDebts}
            wallets={initialWallets}
            dictionary={dictionary}
            settings={settings as TransactionSettings}
            locale={locale}
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Failed to fetch debts page data:", error);
    const dictionary = await getDictionary(locale);
    return (
      <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
        <div className="no-scrollbar min-h-0 flex-1">
          <DebtsClient
            initialData={[]}
            wallets={[]}
            dictionary={dictionary}
            settings={null as unknown as TransactionSettings}
            locale={locale}
          />
        </div>
      </div>
    );
  }
}
