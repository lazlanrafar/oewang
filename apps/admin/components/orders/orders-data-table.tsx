"use client";

import { useOrdersStore } from "@/stores/orders";
import type { PaginationState } from "@tanstack/react-table";
import { DataTable } from "@workspace/ui";
import type { AdminOrderListing } from "@workspace/types";
import { columns } from "./orders-columns";

type Props = {
  data: AdminOrderListing[];
  onRowClick?: (order: AdminOrderListing) => void;
  pagination?: PaginationState;
  onPaginationChange?: (updater: any) => void;
  rowCount?: number;
  pageCount?: number;
};

export function OrdersDataTable({
  data,
  pagination,
  onPaginationChange,
  rowCount,
  pageCount,
}: Props) {
  const { setColumns, openDetail } = useOrdersStore();

  return (
    <DataTable
      data={data}
      columns={columns}
      setColumns={setColumns}
      tableId="orders"
      meta={{ onRowClick: openDetail }}
      sticky={{
        columns: ["code"],
      }}
      emptyMessage="No orders found."
      manualPagination
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      rowCount={rowCount}
      pageCount={pageCount}
      hFull
    />
  );
}
