"use client";

import type { ComponentProps } from "react";

import type { Dictionary } from "@workspace/dictionaries";
import {
  Button,
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";
import { Plus } from "lucide-react";

type DebtFilters = { q: string; status: string };

interface DebtsClientHeaderProps {
  filters: DebtFilters;
  onFilterChange: (filters: DebtFilters) => void;
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
  onAdd: () => void;
  canEditData: boolean;
  dictionary: Dictionary;
}

export function DebtsClientHeader({
  filters,
  onFilterChange,
  columns,
  onAdd,
  canEditData,
  dictionary,
}: DebtsClientHeaderProps) {
  const statusOptions = [
    { id: "unpaid", name: dictionary.debts.statuses.unpaid },
    { id: "partial", name: dictionary.debts.statuses.partial },
    { id: "paid", name: dictionary.debts.statuses.paid },
  ];

  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange}
          placeholder={dictionary.debts.search_placeholder}
          showDateFilter={false}
          showAmountFilter={false}
          statusOptions={statusOptions}
          statusKey="status"
          statusLabel={dictionary.debts.status_label}
          className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
        />
      </div>

      <div className="flex items-center gap-2">
        <DataTableColumnsVisibility columns={columns} />
        {canEditData && (
          <Button variant="default" className="gap-1" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            {dictionary.debts.add_button}
          </Button>
        )}
      </div>
    </div>
  );
}
