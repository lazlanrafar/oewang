"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Wallet, Contact } from "@workspace/types";
import { type DebtWithContact, deleteDebt, getContact } from "@workspace/modules/client";
import {
  Button,
  DataTable,
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";
import { Plus } from "lucide-react";
import { debtColumns } from "./debts-columns";
import { DebtFormSheet } from "./debt-form-sheet";
import { DebtDetailSheet } from "./debt-detail-sheet";
import { ContactDetailSheet } from "../contacts/contact-detail-sheet";
import { DataTableEmptyState } from "@workspace/ui";
import { useAppStore } from "@/stores/app";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { useConfirm } from "@/components/providers/confirm-modal-provider";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface Props {
  initialData: DebtWithContact[];
  wallets: Wallet[];
  dictionary: any;
}

export function DebtsClient({ initialData, wallets, dictionary }: Props) {
  const router = useRouter();
  const [columns, setColumns] = useState<any[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isContactDetailOpen, setIsContactDetailOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<DebtWithContact | undefined>();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  
  const { settings, formatCurrency } = useAppStore();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const { filters, handleFilterChange } = useDataTableFilter({
    initialFilters: {
      q: "",
      status: "",
    },
    debounceMs: 500,
  });

  const handleRowClick = (debt: DebtWithContact) => {
    setSelectedDebt(debt);
    setIsDetailOpen(true);
  };

  const handleContactClick = async (contactId: string) => {
    try {
      const result = await getContact(contactId);
      if (result.success && result.data) {
        setSelectedContact(result.data);
        setIsContactDetailOpen(true);
      } else {
        toast.error(dictionary.debts.toasts.fetch_contact_error);
      }
    } catch (error) {
      toast.error(dictionary.debts.toasts.fetch_contact_error_desc);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: deleteDebt,
    onSuccess: () => {
      toast.success(dictionary.debts.toasts.deleted);
      queryClient.invalidateQueries({ queryKey: ["debts"] });
      router.refresh();
      setIsDetailOpen(false);
      setSelectedDebt(undefined);
    },
    onError: (err: any) => {
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
        dictionary
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dictionary]
  );

  const filteredData = useMemo(() => {
    let result = [...initialData];
    if (filters.status) {
      result = result.filter((d) => d.status === filters.status);
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      result = result.filter(
        (d) =>
          d.contactName.toLowerCase().includes(q) ||
          d.description?.toLowerCase().includes(q) ||
          d.sourceTransactionName?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [initialData, filters]);

  const statusOptions = [
    { id: "unpaid", name: dictionary.debts.statuses.unpaid },
    { id: "partial", name: dictionary.debts.statuses.partial },
    { id: "paid", name: dictionary.debts.statuses.paid },
  ];

  const nonClickableColumns = useMemo(() => new Set(["select", "actions"]), []);

  return (
    <div className="flex w-full flex-col h-full gap-4">
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center flex-1">
          <DataTableFilter
            filters={filters}
            onFilterChange={handleFilterChange as any}
            placeholder={dictionary.debts.search_placeholder}
            showDateFilter={false}
            showAmountFilter={false}
            statusOptions={statusOptions}
            statusKey="status"
            statusLabel={dictionary.debts.status_label}
            className="w-full bg-transparent border-none p-0 focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <DataTableColumnsVisibility columns={columns} />
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            <span className="text-sm">{dictionary.debts.add_button}</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <DataTable
          data={filteredData}
          columns={columnsWithActions}
          setColumns={setColumns}
          tableId="debts"
          sticky={{ columns: ["select", "contactName"] }}
          nonClickableColumns={nonClickableColumns}
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
      </div>

      <DebtFormSheet
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setSelectedDebt(undefined);
        }}
        debt={selectedDebt}
        dictionary={dictionary}
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
      />
    </div>
  );
}
