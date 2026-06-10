"use client";

import { useCallback, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Column } from "@tanstack/react-table";
import type { Dictionary } from "@workspace/dictionaries";
import { type DebtWithContact, deleteDebt, getContact, getDebts } from "@workspace/modules/client";
import type { Contact, TransactionSettings, Wallet } from "@workspace/types";
import { DataTable, DataTableEmptyState, TableSkeleton } from "@workspace/ui";
import { formatCurrency as formatCurrencyUtil } from "@workspace/utils";
import { toast } from "sonner";

import { useConfirm } from "@/components/providers/confirm-modal-provider";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { canEditWorkspaceData } from "@/lib/workspace-permissions";
import { useAppStore } from "@/stores/app";
import { useDebtsStore } from "@/stores/debts";

import { ContactDetailSheet } from "../contacts/contact-detail-sheet";
import { DebtBulkEditBar } from "./debt-bulk-edit-bar";
import { DebtDetailSheet } from "./debt-detail-sheet";
import { DebtFormSheet } from "./debt-form-sheet";
import { DebtsClientCards } from "./debts-client-cards";
import { DebtsClientHeader } from "./debts-client-header";
import { debtColumns } from "./debts-columns";

interface Props {
  initialData: DebtWithContact[];
  wallets: Wallet[];
  dictionary: Dictionary;
  settings: TransactionSettings;
  locale: string;
}

type DebtFilters = { q: string; status: string };

export function DebtsClient({ initialData, wallets, dictionary, settings, locale }: Props) {
  const router = useRouter();
  const [columns, setColumns] = useState<Column<any, unknown>[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isContactDetailOpen, setIsContactDetailOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<DebtWithContact | undefined>();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const formatCurrency = (amount: number, options?: Parameters<typeof formatCurrencyUtil>[2]) =>
    formatCurrencyUtil(amount, settings, options);

  const { workspace } = useAppStore();
  const canEditData = canEditWorkspaceData(workspace?.current_user_role);
  const { rowSelection, setRowSelection } = useDebtsStore();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const { filters, handleFilterChange } = useDataTableFilter<DebtFilters>({
    initialFilters: { q: "", status: "" },
    debounceMs: 500,
  });

  const [mountFilters] = useState(filters);
  const isInitial = useMemo(
    () => JSON.stringify(filters) === JSON.stringify(mountFilters),
    [filters, mountFilters],
  );

  const handleRowClick = useCallback((debt: DebtWithContact) => {
    setSelectedDebt(debt);
    setIsDetailOpen(true);
  }, []);

  const handleContactClick = useCallback(
    async (contactId: string) => {
      try {
        const result = await getContact(contactId);
        if (result.success && result.data) {
          setSelectedContact(result.data);
          setIsContactDetailOpen(true);
        } else {
          toast.error(dictionary.debts.toasts.fetch_contact_error);
        }
      } catch {
        toast.error(dictionary.debts.toasts.fetch_contact_error_desc);
      }
    },
    [dictionary.debts.toasts],
  );

  const deleteMutation = useMutation({
    mutationFn: deleteDebt,
    onSuccess: () => {
      toast.success(dictionary.debts.toasts.deleted);
      queryClient.invalidateQueries({ queryKey: ["debts"] });
      router.refresh();
      setIsDetailOpen(false);
      setSelectedDebt(undefined);
    },
    onError: (err: Error) => {
      toast.error(err.message || dictionary.debts.toasts.delete_failed);
    },
  });

  const columnsWithActions = useMemo(
    () =>
      debtColumns(
        handleRowClick,
        (debt) => {
          setSelectedDebt(debt);
          setIsFormOpen(true);
        },
        handleContactClick,
        async (id) => {
          const ok = await confirm({
            title: dictionary.debts.confirmations.delete_title,
            description: dictionary.debts.confirmations.delete_description,
            confirmLabel: dictionary.debts.actions.delete,
            cancelLabel: dictionary.debts.form.cancel,
            destructive: true,
          });
          if (ok) deleteMutation.mutate(id);
        },
        dictionary,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dictionary, confirm, deleteMutation.mutate, handleContactClick, handleRowClick],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["debts", filters.q, filters.status],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await getDebts({
        contactId: filters.q as string,
        page: pageParam,
        limit: 50,
      });
      if (!res.success) throw new Error(res.message);
      return res;
    },
    getNextPageParam: (lastPage) => {
      const pagination = lastPage.meta?.pagination;
      if (!pagination) return undefined;
      return pagination.page < pagination.total_pages ? pagination.page + 1 : undefined;
    },
    initialData: isInitial
      ? {
          pages: [
            {
              success: true,
              data: initialData,
              code: "OK",
              message: "Initial data",
              meta: {
                pagination: {
                  total: initialData.length,
                  page: 1,
                  limit: 50,
                  total_pages: 1,
                },
                timestamp: Date.now(),
              },
            },
          ],
          pageParams: [1],
        }
      : undefined,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const allDebts = useMemo(() => {
    return data?.pages?.flatMap((p) => p.data ?? []) ?? [];
  }, [data]);

  // Apply client-side status filter (backend doesn't accept status param in current getDebts signature)
  const filteredDebts = useMemo(() => {
    if (!filters.status) return allDebts;
    return allDebts.filter((d) => d.status === filters.status);
  }, [allDebts, filters.status]);

  // Card metrics — count only open debts (unpaid/partial), use remainingAmount
  const cardMetrics = useMemo(() => {
    const now = new Date();
    let totalReceivable = 0;
    let totalPayable = 0;
    let overdueCount = 0;

    for (const debt of allDebts) {
      if (debt.status === "paid") continue;
      const remaining =
        typeof debt.remainingAmount === "number"
          ? debt.remainingAmount
          : Number(debt.remainingAmount) || 0;

      if (debt.type === "receivable") {
        totalReceivable += remaining;
      } else {
        totalPayable += remaining;
      }

      if (debt.dueDate) {
        const due = new Date(debt.dueDate);
        if (!Number.isNaN(due.getTime()) && due < now) {
          overdueCount += 1;
        }
      }
    }

    return {
      totalReceivable,
      totalPayable,
      netPosition: totalReceivable - totalPayable,
      overdueCount,
    };
  }, [allDebts]);

  const nonClickableColumns = useMemo(() => new Set(["select", "actions"]), []);

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <DebtsClientCards
        totalReceivable={cardMetrics.totalReceivable}
        totalPayable={cardMetrics.totalPayable}
        netPosition={cardMetrics.netPosition}
        overdueCount={cardMetrics.overdueCount}
        isLoading={isLoading}
        settings={settings}
        locale={locale}
      />

      <DebtsClientHeader
        filters={filters as DebtFilters}
        onFilterChange={handleFilterChange}
        columns={columns}
        onAdd={() => setIsFormOpen(true)}
        canEditData={canEditData}
        dictionary={dictionary}
      />

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <TableSkeleton
            columns={columnsWithActions}
            rowCount={20}
            stickyColumnIds={["select", "contactName"]}
            actionsColumnId="actions"
          />
        ) : (
          <DataTable
            data={filteredDebts}
            columns={columnsWithActions}
            setColumns={setColumns}
            tableId="debts"
            sticky={{ columns: ["select", "contactName"] }}
            nonClickableColumns={nonClickableColumns}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            infiniteScroll={true}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            meta={{
              onRowClick: handleRowClick,
              onDelete: (id: string) => deleteMutation.mutate(id),
              formatCurrency,
            }}
            emptyMessage={
              <DataTableEmptyState
                title={dictionary.debts.empty.title}
                description={dictionary.debts.empty.description}
                action={
                  canEditData
                    ? { label: dictionary.debts.empty.action, onClick: () => setIsFormOpen(true) }
                    : undefined
                }
              />
            }
            hFull
          />
        )}
        <DebtBulkEditBar dictionary={dictionary} />
      </div>

      <DebtFormSheet
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setSelectedDebt(undefined);
        }}
        debt={selectedDebt}
        dictionary={dictionary}
        settings={settings}
        canEdit={canEditData}
      />

      <DebtDetailSheet
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) setSelectedDebt(undefined);
        }}
        debt={selectedDebt}
        wallets={wallets}
        onDelete={async (id) => {
          const ok = await confirm({
            title: dictionary.debts.confirmations.delete_title,
            description: dictionary.debts.confirmations.delete_description,
            confirmLabel: dictionary.debts.actions.delete,
            cancelLabel: dictionary.debts.form.cancel,
            destructive: true,
          });
          if (ok) deleteMutation.mutate(id);
        }}
        dictionary={dictionary}
        settings={settings}
      />

      <ContactDetailSheet
        contact={selectedContact}
        open={isContactDetailOpen}
        onClose={() => {
          setIsContactDetailOpen(false);
          setSelectedContact(null);
        }}
        onDebtClick={handleRowClick}
        dictionary={dictionary}
        settings={settings}
      />
    </div>
  );
}
