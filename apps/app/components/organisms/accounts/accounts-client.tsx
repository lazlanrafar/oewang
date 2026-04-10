"use client";

import { accountColumns } from "./account-columns";
import type { Wallet } from "@workspace/types";
import { useState, useMemo, useCallback } from "react";
import {
  Button,
  DataTable,
  DataTableColumnsVisibility,
  DataTableFilter,
  DataTableEmptyState,
} from "@workspace/ui";
import { AccountFormSheet } from "./account-form-sheet";
import { AccountDetailSheet } from "./account-detail-sheet";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { Plus } from "lucide-react";
import { useAccountsStore } from "@/stores/accounts";
import { useAppStore } from "@/stores/app";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getWallets } from "@workspace/modules/client";

type Props = {
  initialData: Wallet[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  groups: any[];
  initialFilters?: {
    q: string;
    groupId: string;
  };
};

export function AccountsClient({
  initialData,
  rowCount: initialRowCount,
  pageCount: initialPageCount,
  initialPage,
  pageSize,
  groups: initialGroups,
  initialFilters,
}: Props) {
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<
    string | undefined
  >();
  const { settings, formatCurrency, dictionary } = useAppStore();
  const queryClient = useQueryClient();

  if (!dictionary) return null;

  const { filters, handleFilterChange, pagination, handlePaginationChange } =
    useDataTableFilter({
      initialFilters: initialFilters || {
        q: "",
        groupId: "",
      },
      pageSize,
      initialPage,
    });

  const { columns, setColumns } = useAccountsStore();

  const { data, isLoading, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["wallets", filters.q, filters.groupId],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await getWallets({
        search: filters.q as string,
        groupId: filters.groupId as string,
        page: pageParam,
        limit: pageSize,
      });
      if (!res.success) throw new Error(res.message);
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const pagination = lastPage.meta?.pagination;
      if (!pagination) return undefined;
      return pagination.page < pagination.total_pages
        ? pagination.page + 1
        : undefined;
    },
    initialData: {
      pages: [
        {
          success: true,
          data: initialData,
          code: "OK",
          message: "Initial data",
          meta: {
            pagination: {
              total: initialRowCount,
              page: initialPage + 1,
              limit: pageSize,
              total_pages: initialPageCount,
            },
            timestamp: Date.now(),
          },
        },
      ],
      pageParams: [1],
    },
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const wallets = useMemo(() => {
    return data?.pages.flatMap((page: any) => page.data || []) || [];
  }, [data]);

  const selectedWallet = useMemo(() => {
    return wallets.find((w) => w.id === selectedWalletId);
  }, [wallets, selectedWalletId]);

  const totalBalance = useMemo(() => {
    return wallets.reduce((acc, w) => acc + Number(w.balance), 0);
  }, [wallets]);

  const activeAccounts = useMemo(() => {
    return wallets.filter((w) => Number(w.balance) > 0).length;
  }, [wallets]);

  const updateWalletInCache = useCallback(
    (updatedWallet: Wallet) => {
      queryClient.setQueriesData({ queryKey: ["wallets"] }, (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            data: page.data?.map((wallet: Wallet) =>
              wallet.id === updatedWallet.id ? updatedWallet : wallet,
            ),
          })),
        };
      });
    },
    [queryClient],
  );

  const handleCreate = () => {
    setSelectedWalletId(undefined);
    setIsFormSheetOpen(true);
  };

  const handleEdit = (wallet: Wallet) => {
    setSelectedWalletId(wallet.id);
    setIsFormSheetOpen(true);
  };

  const handleRowClick = (wallet: Wallet) => {
    setSelectedWalletId(wallet.id);
    setIsDetailSheetOpen(true);
  };

  const columnsWithActions = useMemo(() => {
    if (!dictionary) return [];
    return accountColumns(handleEdit, updateWalletInCache, dictionary);
  }, [handleEdit, updateWalletInCache, dictionary]);

  const groupOptions = useMemo(() => {
    return initialGroups.map((g) => ({
      name: g.name,
      id: g.id,
    }));
  }, [initialGroups]);

  if (!dictionary) return null;

  return (
    <div className="flex w-full flex-col h-full space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.accounts.total_balance}
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight">
            {formatCurrency(totalBalance)}
          </span>
        </div>
        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.accounts.title}
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight">
            {wallets.length}
          </span>
        </div>
        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            {dictionary.accounts.active}
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight text-emerald-600 dark:text-emerald-400">
            {activeAccounts}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 shrink-0 px-1">
        <div className="flex items-center flex-1 max-w-sm">
          <DataTableFilter
            filters={filters}
            onFilterChange={handleFilterChange as any}
            placeholder={dictionary.accounts.search_placeholder}
            showDateFilter={false}
            showAmountFilter={false}
            statusOptions={groupOptions}
            statusKey="groupId"
            statusLabel={dictionary.accounts.group_label}
            className="w-full bg-transparent border-none p-0 focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-2">
          <DataTableColumnsVisibility columns={columns} />
          <Button onClick={handleCreate} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {dictionary.accounts.add_account}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <DataTable
          data={wallets}
          columns={columnsWithActions}
          setColumns={setColumns}
          tableId="accounts"
          sticky={{
            columns: ["name"],
            startFromColumn: 0,
          }}
          emptyMessage={
            <DataTableEmptyState
              title={dictionary.accounts.empty.title}
              description={dictionary.accounts.empty.description}
              action={{
                label: dictionary.accounts.empty.action,
                onClick: handleCreate,
              }}
            />
          }
          infiniteScroll={true}
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          hFull
          meta={{
            groups: initialGroups,
            settings,
            formatCurrency,
            onRowClick: handleRowClick,
          }}
        />
      </div>

      <AccountFormSheet
        open={isFormSheetOpen}
        onOpenChange={setIsFormSheetOpen}
        wallet={selectedWallet as any}
        onSuccess={(wallet) => {
          if (selectedWalletId) {
            updateWalletInCache(wallet);
          } else {
            queryClient.invalidateQueries({ queryKey: ["wallets"] });
          }
        }}
      />

      <AccountDetailSheet
        open={isDetailSheetOpen}
        onOpenChange={setIsDetailSheetOpen}
        wallet={selectedWallet}
        groups={initialGroups}
        onEdit={() => {
          setIsDetailSheetOpen(false);
          setIsFormSheetOpen(true);
        }}
      />
    </div>
  );
}
