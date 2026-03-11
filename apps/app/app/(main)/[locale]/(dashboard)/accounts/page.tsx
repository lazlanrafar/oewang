import React from "react";
import { ScrollableContent } from "@workspace/ui";
import { getWallets } from "@workspace/modules/server";
import { getWalletGroups } from "@workspace/modules/server";
import { AccountsClient } from "@/components/organisms/accounts/accounts-client";

export default async function AccountsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || 20;
  const search =
    typeof searchParams.search === "string" ? searchParams.search : undefined;
  const groupId =
    typeof searchParams.groupId === "string" ? searchParams.groupId : undefined;

  // Get initial data for SSR
  const [walletsRes, groupsRes] = await Promise.all([
    getWallets({ search, groupId }),
    getWalletGroups(),
  ]);

  const wallets = Array.isArray(walletsRes?.data) ? walletsRes.data : [];
  const groups = Array.isArray(groupsRes?.data) ? groupsRes.data : [];

  const rowCount = wallets.length; // Note: In a real app with server-side pagination, this should come from API
  const pageCount = Math.ceil(rowCount / limit);

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col bg-background no-scrollbar">
      <div className="flex-1 min-h-0 no-scrollbar">
        <AccountsClient
          initialData={wallets}
          rowCount={rowCount}
          pageCount={pageCount}
          initialPage={page - 1}
          pageSize={limit}
          groups={groups}
        />
      </div>
    </div>
  );
}
