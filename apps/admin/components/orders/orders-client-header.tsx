"use client";

import type { ComponentProps } from "react";
import {
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";

export type OrdersFilters = {
  q: string;
  status: string | null;
  start: string | null;
  end: string | null;
};

type FilterOption = { id: string; name: string };

interface OrdersClientHeaderProps {
  filters: OrdersFilters;
  onFilterChange: (filters: OrdersFilters) => void;
  statusOptions: FilterOption[];
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
}

export function OrdersClientHeader({
  filters,
  onFilterChange,
  statusOptions,
  columns,
}: OrdersClientHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange as never}
          statusOptions={statusOptions}
          placeholder="Search orders..."
          className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
        />
      </div>

      <div className="flex items-center gap-2">
        <DataTableColumnsVisibility columns={columns} />
      </div>
    </div>
  );
}
