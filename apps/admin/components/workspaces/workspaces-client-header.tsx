"use client";

import type { ComponentProps } from "react";
import {
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";

export type WorkspacesFilters = {
  q: string;
};

interface WorkspacesClientHeaderProps {
  filters: WorkspacesFilters;
  onFilterChange: (filters: WorkspacesFilters) => void;
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
}

export function WorkspacesClientHeader({
  filters,
  onFilterChange,
  columns,
}: WorkspacesClientHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange as never}
          placeholder="Search workspaces..."
          showDateFilter={false}
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
