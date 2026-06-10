import type { Dictionary } from "@workspace/dictionaries";
import { getCategories, getTransactions, getWallets } from "@workspace/modules/server";
import type { Category, Transaction, Wallet } from "@workspace/types";
import { endOfMonth, startOfMonth } from "date-fns";
import type { Metadata } from "next";

import { TransactionsClient } from "@/components/organisms/transactions/transaction-client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Transactions",
};

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;


export default async function TransactionPage(props: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;

  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;
  const type = typeof searchParams.type === "string" ? searchParams.type : undefined;
  const walletId = typeof searchParams.walletId === "string" ? searchParams.walletId : undefined;
  const categoryId = typeof searchParams.categoryId === "string" ? searchParams.categoryId : undefined;
  const startDate =
    typeof searchParams.startDate === "string" ? searchParams.startDate : startOfMonth(new Date()).toISOString();
  const endDate =
    typeof searchParams.endDate === "string" ? searchParams.endDate : endOfMonth(new Date()).toISOString();

  let initialTransactions: Transaction[] = [];
  let rowCount = 0;
  let initialWallets: Wallet[] = [];
  let initialCategories: Category[] = [];
  let dictData: Dictionary | null = null;

  try {
    const [transactionsRes, walletsRes, categoriesRes, fetchedDict] = await Promise.all([
      getTransactions({ page, limit, type, walletId, categoryId, startDate, endDate } as Parameters<typeof getTransactions>[0]),
      getWallets(),
      getCategories(),
      getDictionary(locale),
    ]);

    dictData = fetchedDict;
    if (transactionsRes?.success && transactionsRes?.data) {
      initialTransactions = transactionsRes.data;
      rowCount = transactionsRes.meta?.pagination?.total ?? 0;
    }
    if (walletsRes?.success && walletsRes?.data) initialWallets = walletsRes.data;
    if (categoriesRes?.success && categoriesRes?.data) initialCategories = categoriesRes.data;
  } catch (error) {
    console.error("Failed to fetch transactions page data:", error);
  }

  return (
    <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
      <div className="no-scrollbar min-h-0 flex-1">
        <TransactionsClient
          initialData={initialTransactions}
          rowCount={rowCount}
          pageCount={Math.ceil(rowCount / limit)}
          initialPage={page - 1}
          pageSize={limit}
          wallets={initialWallets}
          categories={initialCategories}
          dictionary={dictData as Dictionary}
        />
      </div>
    </div>
  );
}
