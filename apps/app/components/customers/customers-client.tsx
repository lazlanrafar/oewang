"use client";

import { useState, useCallback } from "react";
import { Button, DataTable, DataTableFilter } from "@workspace/ui";
import { CustomerFormSheet } from "./customer-form-sheet";
import { CustomerDetailSheet } from "./customer-detail-sheet";
import { getCustomerColumns } from "./customer-columns";
import type { Customer } from "@workspace/types";
import { Plus, Users } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getCustomers } from "@workspace/modules/client";
import { useDataTableFilter } from "@/hooks/use-data-table-filter";
import { useCustomersStore } from "@/stores/customers";

interface SummaryCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
}

function SummaryCard({ title, value, icon: Icon }: SummaryCardProps) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card flex items-center gap-4">
      <div className="p-2 rounded-md bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </div>
    </div>
  );
}

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
    <div className="h-full flex flex-col">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-4 px-4 pt-4">
        <SummaryCard
          title="Total Customers"
          value={allCustomers.length}
          icon={Users}
        />
        <SummaryCard
          title="Added This Month"
          value={addedThisMonth}
          icon={Users}
        />
      </div>

      {/* Controls */}
      <div className="px-4 pb-3 flex items-center justify-between gap-3">
        <DataTableFilter
          filters={filters}
          onFilterChange={handleFilterChange as any}
          placeholder="Search customers..."
          showDateFilter={false}
          showAmountFilter={false}
          className="max-w-sm"
        />
        <Button
          size="sm"
          onClick={() => {
            setEditCustomer(null);
            setIsFormSheetOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Customer
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 px-4 pb-4">
        <DataTable
          data={allCustomers}
          columns={tableColumns as any}
          setColumns={setColumns}
          tableId="customers"
          hFull
          isLoading={isLoading}
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
