import { Suspense } from "react";

import { getWalletGroups, getWallets } from "@workspace/modules/server";
import type { Metadata } from "next";

import { AccountTableSkeleton } from "@/components/organisms/accounts/account-table-skeleton";
import { AccountsClient } from "@/components/organisms/accounts/accounts-client";
import { Hydrated } from "@/components/shared/hydrated";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Accounts",
};

export default async function AccountsPage(props: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || 20;

  return (
    <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
      <div className="no-scrollbar min-h-0 flex-1">
        <Suspense fallback={<AccountTableSkeleton />}>
          <AccountsPageContent locale={locale} searchParams={searchParams} page={page} limit={limit} />
        </Suspense>
      </div>
    </div>
  );
}

async function AccountsPageContent({
  locale,
  searchParams,
  page,
  limit,
}: {
  locale: Locale;
  searchParams: { [key: string]: string | string[] | undefined };
  page: number;
  limit: number;
}) {
  const search = Array.isArray(searchParams.search) ? searchParams.search[0] : searchParams.search;
  const groupId = Array.isArray(searchParams.groupId) ? searchParams.groupId[0] : searchParams.groupId;

  // Get initial data for SSR
  const [walletsRes, groupsRes, dictionary] = await Promise.all([
    getWallets({ search, groupId }),
    getWalletGroups(),
    getDictionary(locale),
  ]);

  const wallets = Array.isArray(walletsRes?.data) ? walletsRes.data : [];
  const groups = Array.isArray(groupsRes?.data) ? groupsRes.data : [];

  const rowCount = wallets.length;
  const pageCount = Math.ceil(rowCount / limit);

  return (
    <Hydrated fallback={<AccountTableSkeleton />}>
      <AccountsClient
        initialData={wallets}
        rowCount={rowCount}
        pageCount={pageCount}
        initialPage={page - 1}
        pageSize={limit}
        groups={groups}
        initialFilters={{
          q: search || "",
          groupId: groupId || "",
        }}
        dictionary={dictionary}
        locale={locale}
      />
    </Hydrated>
  );
}
