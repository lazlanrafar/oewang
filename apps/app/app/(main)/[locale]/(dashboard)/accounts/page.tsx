import { getWalletGroups, getWallets } from "@workspace/modules/server";
import type { Metadata } from "next";

import { AccountsClient } from "@/components/organisms/accounts/accounts-client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Accounts",
};

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

export default async function AccountsPage(props: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;

  const search = Array.isArray(searchParams.search) ? searchParams.search[0] : searchParams.search;
  const groupId = Array.isArray(searchParams.groupId) ? searchParams.groupId[0] : searchParams.groupId;

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
    <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
      <div className="no-scrollbar min-h-0 flex-1">
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
      </div>
    </div>
  );
}
