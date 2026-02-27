import { Suspense } from "react";

import type { Category, Transaction, Wallet } from "@workspace/types";

import { getCategories } from "@workspace/modules";
import { getTransactions } from "@workspace/modules";
import { getWallets } from "@workspace/modules";
import { TransactionView } from "@/components/transactions/transaction-view";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

export default async function TransactionPage() {
  let initialTransactions: Transaction[] = [];
  let initialTotal = 0;
  let initialWallets: Wallet[] = [];
  let initialCategories: Category[] = [];

  try {
    const [transactionsRes, walletsRes, categoriesRes] = await Promise.all([
      getTransactions({ page: 1, limit: PAGE_LIMIT }),
      getWallets(),
      getCategories(),
    ]);

    if (transactionsRes?.success && transactionsRes?.data) {
      initialTransactions = transactionsRes.data;
      initialTotal = transactionsRes.meta?.pagination?.total ?? 0;
    }

    if (walletsRes?.success && walletsRes?.data) {
      initialWallets = walletsRes.data;
    }

    if (categoriesRes?.success && categoriesRes?.data) {
      initialCategories = categoriesRes.data;
    }
  } catch (error) {
    console.error("Failed to fetch initial data for transactions page:", error);
  }

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col">
      <div className="flex-1 min-h-0">
        <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
          <TransactionView
            initialTransactions={initialTransactions}
            initialTotal={initialTotal}
            initialWallets={initialWallets}
            initialCategories={initialCategories}
          />
        </Suspense>
      </div>
    </div>
  );
}
