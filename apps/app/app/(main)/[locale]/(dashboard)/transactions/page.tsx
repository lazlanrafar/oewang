import { Suspense } from "react";
import { startOfMonth, endOfMonth } from "date-fns";

import type { Category, Transaction, Wallet } from "@workspace/types";

import { getCategories } from "@workspace/modules/server";
import { getTransactions } from "@workspace/modules/server";
import { getWallets } from "@workspace/modules/server";
import { TransactionsClient } from "@/components/organisms/transactions/transaction-client";
import { TransactionTableSkeleton } from "@/components/organisms/transactions/transaction-table-skeleton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transactions",
};

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

export default async function TransactionPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col bg-background no-scrollbar">
      <div className="flex-1 min-h-0 no-scrollbar">
        <Suspense fallback={<TransactionTableSkeleton />}>
          <TransactionPageContent
            searchParams={searchParams}
            page={page}
            limit={limit}
          />
        </Suspense>
      </div>
    </div>
  );
}

async function TransactionPageContent({
  searchParams,
  page,
  limit,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  page: number;
  limit: number;
}) {
  const type =
    typeof searchParams.type === "string" ? searchParams.type : undefined;
  const walletId =
    typeof searchParams.walletId === "string"
      ? searchParams.walletId
      : undefined;
  const categoryId =
    typeof searchParams.categoryId === "string"
      ? searchParams.categoryId
      : undefined;
  const startDate =
    typeof searchParams.startDate === "string"
      ? searchParams.startDate
      : startOfMonth(new Date()).toISOString();
  const endDate =
    typeof searchParams.endDate === "string"
      ? searchParams.endDate
      : endOfMonth(new Date()).toISOString();

  let initialTransactions: Transaction[] = [];
  let rowCount = 0;
  let initialWallets: Wallet[] = [];
  let initialCategories: Category[] = [];

  try {
    const [transactionsRes, walletsRes, categoriesRes] = await Promise.all([
      getTransactions({
        page,
        limit,
        type,
        walletId,
        categoryId,
        startDate,
        endDate,
      } as any),
      getWallets(),
      getCategories(),
    ]);

    if (transactionsRes?.success && transactionsRes?.data) {
      initialTransactions = transactionsRes.data;
      rowCount = transactionsRes.meta?.pagination?.total ?? 0;
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

  const pageCount = Math.ceil(rowCount / limit);

  return (
    <TransactionsClient
      initialData={initialTransactions}
      rowCount={rowCount}
      pageCount={pageCount}
      initialPage={page - 1}
      pageSize={limit}
      wallets={initialWallets}
      categories={initialCategories}
    />
  );
}
