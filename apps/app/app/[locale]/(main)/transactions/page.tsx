import { getTransactions } from "@/actions/transaction.actions";
import { TransactionView } from "@/components/transactions/transaction-view";
import { Suspense } from "react";
import { Transaction } from "@workspace/types";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

export default async function TransactionPage() {
  let initialTransactions: Transaction[] = [];
  let initialTotal = 0;

  try {
    const response = await getTransactions({ page: 1, limit: PAGE_LIMIT });
    if (response?.success && response?.data) {
      initialTransactions = response.data;
      initialTotal = response.meta?.pagination?.total ?? 0;
    }
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="p-8 text-center text-muted-foreground">
              Loading...
            </div>
          }
        >
          <TransactionView
            initialTransactions={initialTransactions}
            initialTotal={initialTotal}
          />
        </Suspense>
      </div>
    </div>
  );
}
