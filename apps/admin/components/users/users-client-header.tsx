"use client";

import type { ComponentProps } from "react";
import {
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";

export type UsersFilters = {
  q: string;
  system_role: string | null;
  start: string | null;
  end: string | null;
};

type FilterOption = { id: string; name: string };

interface UsersClientHeaderProps {
  filters: UsersFilters;
  onFilterChange: (filters: UsersFilters) => void;
  statusOptions: FilterOption[];
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
}

export function UsersClientHeader({
  filters,
  onFilterChange,
  statusOptions,
  columns,
}: UsersClientHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange as never}
          statusOptions={statusOptions}
          statusKey="system_role"
          statusLabel="Role"
          placeholder="Search users..."
          showAmountFilter={false}
          className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
        />
      </div>

      <div className="flex items-center gap-2">
        <DataTableColumnsVisibility columns={columns} />
      </div>
    </div>
  );
}
