import { Suspense } from "react";
import { getWallets, getWalletGroups } from "@workspace/modules/server";
import { AccountsClient } from "@/components/organisms/accounts/accounts-client";
import { AccountTableSkeleton } from "@/components/organisms/accounts/account-table-skeleton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accounts",
};

export default async function AccountsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || 20;

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col bg-background no-scrollbar">
      <div className="flex-1 min-h-0 no-scrollbar">
        <Suspense fallback={<AccountTableSkeleton />}>
          <AccountsPageContent
            searchParams={searchParams}
            page={page}
            limit={limit}
          />
        </Suspense>
      </div>
    </div>
  );
}

async function AccountsPageContent({
  searchParams,
  page,
  limit,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  page: number;
  limit: number;
}) {
  const search = Array.isArray(searchParams.search)
    ? searchParams.search[0]
    : searchParams.search;
  const groupId = Array.isArray(searchParams.groupId)
    ? searchParams.groupId[0]
    : searchParams.groupId;

  // Get initial data for SSR
  const [walletsRes, groupsRes] = await Promise.all([
    getWallets({ search, groupId }),
    getWalletGroups(),
  ]);

  const wallets = Array.isArray(walletsRes?.data) ? walletsRes.data : [];
  const groups = Array.isArray(groupsRes?.data) ? groupsRes.data : [];

  const rowCount = wallets.length;
  const pageCount = Math.ceil(rowCount / limit);

  return (
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
    />
  );
}
