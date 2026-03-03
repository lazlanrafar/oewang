"use client";

import { usePricingStore } from "@/stores/pricing";
import type { PaginationState } from "@tanstack/react-table";
import { DataTable } from "@workspace/ui";
import type { Pricing } from "@workspace/types";
import { pricingColumns } from "./pricing-columns";

type Props = {
  data: Pricing[];
  onRowClick?: (pricing: Pricing) => void;
  pagination?: PaginationState;
  onPaginationChange?: (updater: any) => void;
  rowCount?: number;
  pageCount?: number;
};

export function PricingDataTable({
  data,
  onRowClick,
  pagination,
  onPaginationChange,
  rowCount,
  pageCount,
}: Props) {
  const { setColumns } = usePricingStore();

  return (
    <DataTable
      data={data}
      columns={pricingColumns}
      setColumns={setColumns}
      tableId="pricing"
      meta={{ onRowClick }}
      sticky={{
        columns: ["name"],
        startFromColumn: 1,
      }}
      emptyMessage="No pricing plans found."
      manualPagination
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      rowCount={rowCount}
      pageCount={pageCount}
      hFull
    />
  );
}
