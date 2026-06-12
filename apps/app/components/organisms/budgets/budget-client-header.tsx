"use client";

import type { ComponentProps } from "react";

import {
  Button,
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";
import { Plus } from "lucide-react";

type BudgetFilters = {
  q: string;
};

interface BudgetClientHeaderProps {
  filters: BudgetFilters;
  onFilterChange: (filters: BudgetFilters) => void;
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
  onAdd: () => void;
}

export function BudgetClientHeader({
  filters,
  onFilterChange,
  columns,
  onAdd,
}: BudgetClientHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 px-1">
      <div className="flex max-w-sm flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange}
          placeholder="Search categories..."
          showDateFilter={false}
          showAmountFilter={false}
          className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
        />
      </div>

      <div className="flex items-center gap-2">
        <DataTableColumnsVisibility columns={columns} />
        <Button variant="default" className="gap-1" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          New Budget
        </Button>
      </div>
    </div>
  );
}
