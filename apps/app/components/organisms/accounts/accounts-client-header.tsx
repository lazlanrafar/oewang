"use client";

import type { ComponentProps } from "react";

import type { Dictionary } from "@workspace/dictionaries";
import {
  Button,
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";
import { Plus } from "lucide-react";

type AccountsFilters = {
  q: string;
  groupId: string;
};

interface AccountsClientHeaderProps {
  filters: AccountsFilters;
  onFilterChange: (filters: AccountsFilters) => void;
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
  groupOptions: { id: string; name: string }[];
  onAdd: () => void;
  dictionary: Dictionary;
}

export function AccountsClientHeader({
  filters,
  onFilterChange,
  columns,
  groupOptions,
  onAdd,
  dictionary,
}: AccountsClientHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex max-w-sm flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange}
          placeholder={dictionary.accounts.search_placeholder}
          showDateFilter={false}
          showAmountFilter={false}
          statusOptions={groupOptions}
          statusKey="groupId"
          statusLabel={dictionary.accounts.group_label}
          className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
        />
      </div>

      <div className="flex items-center gap-2">
        <DataTableColumnsVisibility columns={columns} />
        <Button variant="default" className="gap-1" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {dictionary.accounts.add_account}
        </Button>
      </div>
    </div>
  );
}
