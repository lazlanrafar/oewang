"use client";

import { useState, useCallback } from "react";
import {
  Button,
  DataTable,
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";
import { CustomerFormSheet } from "./customer-form-sheet";
import { CustomerDetailSheet } from "./customer-detail-sheet";
import { getCustomerColumns } from "./customer-columns";
import type { Customer } from "@workspace/types";
import { Plus } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getCustomers } from "@workspace/modules/client";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { useCustomersStore } from "@/stores/customers";

interface Props {
  initialData: Customer[];
}

export function CustomersClient({ initialData }: Props) {
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);

  const { columns, setColumns } = useCustomersStore();

  const { filters, handleFilterChange } = useDataTableFilter({
    initialFilters: { q: "" },
    pageSize: 50,
    initialPage: 0,
  });

  const { data, isLoading } = useInfiniteQuery({
    queryKey: ["customers", filters.q],
    queryFn: async () => {
      const res = await getCustomers({ search: filters.q as string });
      if (!res.success) throw new Error(res.error);
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: () => null,
    initialData: {
      pages: [{ success: true, data: initialData }],
      pageParams: [1],
    },
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const allCustomers = data?.pages.flatMap((p) => p.data ?? []) ?? [];

  const now = new Date();
  const thisMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();
  const addedThisMonth = allCustomers.filter(
    (c) => c.createdAt && c.createdAt >= thisMonthStart,
  ).length;

  const handleEdit = useCallback((customer: Customer) => {
    setEditCustomer(customer);
    setIsFormSheetOpen(true);
  }, []);

  const handleRowClick = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDetailSheetOpen(true);
  }, []);

  const tableColumns = getCustomerColumns(handleEdit);

  return (
    <div className="flex w-full flex-col h-full space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-6 flex flex-col gap-1 border border-border bg-muted/5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Total Customers
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight">
            {allCustomers.length}
          </span>
        </div>

        <div className="p-6 flex flex-col gap-1 border border-border">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Added This Month
          </span>
          <span className="text-3xl font-serif font-medium tracking-tight text-emerald-600 dark:text-emerald-400">
            {addedThisMonth}
          </span>
        </div>

        <div className="p-6 flex flex-col gap-1 border border-border bg-muted/5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Most Active Client
          </span>
          <span className="text-lg font-serif font-medium tracking-tight truncate">
            {allCustomers.length > 0 ? (allCustomers[0]?.name ?? "–") : "–"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            No activity data
          </span>
        </div>

        <div className="p-6 flex flex-col gap-1 border border-border bg-muted/5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            Top Revenue Client
          </span>
          <span className="text-lg font-serif font-medium tracking-tight truncate">
            {allCustomers.length > 0 ? (allCustomers[0]?.name ?? "–") : "–"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            No revenue data
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 shrink-0 px-1">
        <div className="flex items-center flex-1 max-w-sm">
          <DataTableFilter
            filters={filters}
            onFilterChange={handleFilterChange as any}
            placeholder="Search customers..."
            showDateFilter={false}
            showAmountFilter={false}
            className="w-full bg-transparent border-none p-0 focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <DataTableColumnsVisibility columns={columns} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditCustomer(null);
              setIsFormSheetOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Customer
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 relative">
        <DataTable
          data={allCustomers}
          columns={tableColumns as any}
          setColumns={setColumns}
          tableId="customers"
          hFull
          emptyMessage="No customers yet. Add your first customer to get started."
          meta={{
            onRowClick: handleRowClick,
          }}
        />
      </div>

      <CustomerFormSheet
        open={isFormSheetOpen}
        onClose={() => {
          setIsFormSheetOpen(false);
          setEditCustomer(null);
        }}
        customer={editCustomer}
      />

      <CustomerDetailSheet
        customer={selectedCustomer}
        open={isDetailSheetOpen}
        onClose={() => {
          setIsDetailSheetOpen(false);
          setSelectedCustomer(null);
        }}
      />
    </div>
  );
}
