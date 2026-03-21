"use client";

import { useState, useCallback } from "react";
import {
  Button,
  DataTable,
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";
import { InvoiceFormSheet } from "./invoice-form-sheet";
import { InvoiceDetailSheet } from "./invoice-detail-sheet";
import { buildInvoiceColumns } from "./invoice-columns";
import type { Invoice } from "@workspace/types";
import { Plus } from "lucide-react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  getInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  type CreateInvoiceData,
} from "@workspace/modules/client";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { useInvoicesStore } from "@/stores/invoices";
import { toast } from "sonner";

type InvoiceRow = Invoice & {
  contact?: { name?: string; email?: string } | null;
};

interface Props {
  initialData?: any;
}

export function InvoicesClient({ initialData }: Props) {
  const queryClient = useQueryClient();
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(
    null,
  );
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);

  const { columns, setColumns } = useInvoicesStore();

  const { filters, handleFilterChange } = useDataTableFilter({
    initialFilters: { q: "", status: "" },
    pageSize: 50,
    initialPage: 0,
  });

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: ["invoices", filters.q, filters.status],
      queryFn: async ({ pageParam = 1 }) => {
        const res = await getInvoices({
          search: filters.q as string,
          status: (filters.status as string) || undefined,
          page: pageParam as number,
          limit: 50,
        });
        if (!res.success) throw new Error((res as any).error);
        return res;
      },
      initialPageParam: 1,
      getNextPageParam: (lastPage: any) => {
        const meta = lastPage.meta?.pagination;
        if (!meta) return undefined;
        const nextPage = meta.page + 1;
        return nextPage <= meta.total_pages ? nextPage : undefined;
      },
      staleTime: 60000,
      refetchOnWindowFocus: false,
    });

  const allInvoices: InvoiceRow[] =
    data?.pages.flatMap((p: any) => {
      const items = p.data;
      if (!items) return [];
      if (Array.isArray(items)) {
        return items.map((item: any) => {
          if (item.invoice) {
            return {
              ...item.invoice,
              contact: item.contact,
            };
          }
          return item;
        });
      }
      if (typeof items === "object" && "invoice" in items) {
        return [{ ...items.invoice, contact: (items as any).contact }];
      }
      return [];
    }) ?? [];

  // Derived counts
  const openCount = allInvoices.filter(
    (i) => i.status === "unpaid" || i.status === "draft",
  ).length;
  const overdueCount = allInvoices.filter((i) => i.status === "overdue").length;
  const paidCount = allInvoices.filter((i) => i.status === "paid").length;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }, [queryClient]);

  const handleEdit = useCallback((invoice: InvoiceRow) => {
    setEditInvoice(invoice as Invoice);
    setIsFormSheetOpen(true);
  }, []);

  const handleRowClick = useCallback((invoice: InvoiceRow) => {
    setSelectedInvoice(invoice);
    setIsDetailSheetOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await deleteInvoice(id);
      if (res.success) {
        toast.success("Invoice deleted");
        refresh();
      } else {
        toast.error("Failed to delete invoice");
      }
    },
    [refresh],
  );

  const handleUpdate = useCallback(
    async (id: string, data: Partial<Invoice>) => {
      const res = await updateInvoice(id, data as any);
      if (res.success) {
        refresh();
        setSelectedInvoice((prev) =>
          prev?.id === id ? { ...prev, ...data } : prev
        );
      } else {
        throw new Error("Update failed");
      }
    },
    [refresh],
  );

  const handleFormSubmit = useCallback(
    async (formData: CreateInvoiceData, isSilent?: boolean) => {
      let result: any;
      if (editInvoice?.id) {
        const res = await updateInvoice(editInvoice.id, formData as any);
        if (!res.success) {
          if (!isSilent) toast.error("Failed to update invoice");
          return false;
        }
        result = res.data;
      } else {
        const res = await createInvoice(formData);
        if (!res.success) {
          if (!isSilent) toast.error("Failed to create invoice");
          return false;
        }
        result = res.data;
        if (isSilent) {
          setEditInvoice(result);
        }
      }
      refresh();
      return result || true;
    },
    [editInvoice, refresh, setEditInvoice],
  );

  const tableColumns = buildInvoiceColumns({
    onEdit: handleEdit,
    onDelete: (invoice) => handleDelete(invoice.id),
  });

  return (
    <div className="flex w-full flex-col h-full space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Total Invoices
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight">
            {allInvoices.length}
          </span>
        </div>
        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Open
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight text-yellow-600 dark:text-yellow-400">
            {openCount}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Draft + Unpaid
          </span>
        </div>
        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Overdue
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight text-red-600 dark:text-red-400">
            {overdueCount}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Past due date
          </span>
        </div>
        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Paid
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight text-emerald-600 dark:text-emerald-400">
            {paidCount}
          </span>
          <span className="text-[10px] text-muted-foreground">Completed</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 shrink-0 px-1">
        <div className="flex items-center flex-1 max-w-sm">
          <DataTableFilter
            filters={filters}
            onFilterChange={handleFilterChange as any}
            placeholder="Search invoices..."
            showDateFilter={false}
            showAmountFilter={false}
            className="w-full bg-transparent border-none p-0 focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <DataTableColumnsVisibility columns={columns} />
          <Button
            variant="outline"
            onClick={() => {
              setEditInvoice(null);
              setIsFormSheetOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New Invoice
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 relative">
        <DataTable
          data={allInvoices}
          columns={tableColumns as any}
          setColumns={setColumns}
          tableId="invoices"
          hFull
          emptyMessage="No invoices yet. Create your first invoice to get started."
          meta={{
            onRowClick: handleRowClick,
          }}
          infiniteScroll
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      </div>

      <InvoiceFormSheet
        open={isFormSheetOpen}
        onOpenChange={(open) => {
          setIsFormSheetOpen(open);
          if (!open) setEditInvoice(null);
        }}
        invoice={editInvoice}
        onSubmit={handleFormSubmit}
        onSuccess={refresh}
      />

      <InvoiceDetailSheet
        invoice={selectedInvoice}
        open={isDetailSheetOpen}
        onOpenChange={(open) => {
          setIsDetailSheetOpen(open);
          if (!open) setSelectedInvoice(null);
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
