"use client";

import { useCallback, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { type DebtWithContact, deleteDebt, getContact, getDebts } from "@workspace/modules/client";
import type { Contact, TransactionSettings, Wallet } from "@workspace/types";
import { Button, DataTable, DataTableColumnsVisibility, DataTableEmptyState, DataTableFilter } from "@workspace/ui";
import { formatCurrency as formatCurrencyUtil } from "@workspace/utils";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/providers/confirm-modal-provider";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { useDebtsStore } from "@/stores/debts";

import { ContactDetailSheet } from "../contacts/contact-detail-sheet";
import { DebtBulkEditBar } from "./debt-bulk-edit-bar";
import { DebtDetailSheet } from "./debt-detail-sheet";
import { DebtFormSheet } from "./debt-form-sheet";
import { debtColumns } from "./debts-columns";

interface Props {
  initialData: DebtWithContact[];
  wallets: Wallet[];
  dictionary: Dictionary;
  settings: TransactionSettings;
}

export function DebtsClient({ initialData, wallets, dictionary, settings }: Props) {
  const router = useRouter();
  const [columns, setColumns] = useState<string[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isContactDetailOpen, setIsContactDetailOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<DebtWithContact | undefined>();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const formatCurrency = (amount: number, options?: Parameters<typeof formatCurrencyUtil>[2]) =>
    formatCurrencyUtil(amount, settings, options);
  const { rowSelection, setRowSelection } = useDebtsStore();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const { filters, handleFilterChange } = useDataTableFilter({
    initialFilters: {
      q: "",
      status: "",
    },
    debounceMs: 500,
  });

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
      } catch (_error) {
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

  const {
    data,
    isLoading: _isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["debts", filters.q, filters.status],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await getDebts({
        contactId: filters.q as string, // Search is handled by backend
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
    initialData: {
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
    },
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const allDebts = useMemo(() => {
    return data.pages?.flatMap((p) => p.data ?? []) ?? [];
  }, [data]);

  const statusOptions = [
    { id: "unpaid", name: dictionary.debts.statuses.unpaid },
    { id: "partial", name: dictionary.debts.statuses.partial },
    { id: "paid", name: dictionary.debts.statuses.paid },
  ];

  const nonClickableColumns = useMemo(() => new Set(["select", "actions"]), []);

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex flex-1 items-center">
          <DataTableFilter
            filters={filters}
            onFilterChange={handleFilterChange}
            placeholder={dictionary.debts.search_placeholder}
            showDateFilter={false}
            showAmountFilter={false}
            statusOptions={statusOptions}
            statusKey="status"
            statusLabel={dictionary.debts.status_label}
            className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <DataTableColumnsVisibility columns={columns} />
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            <span className="text-sm">{dictionary.debts.add_button}</span>
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <DataTable
          data={allDebts}
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
              action={{
                label: dictionary.debts.empty.action,
                onClick: () => setIsFormOpen(true),
              }}
            />
          }
          hFull
        />
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
