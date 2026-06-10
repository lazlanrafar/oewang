"use client";

import type { ComponentProps } from "react";

import type { Dictionary } from "@workspace/dictionaries";
import {
  Button,
  DataTableColumnsVisibility,
  DataTableFilter,
} from "@workspace/ui";
import { Plus } from "lucide-react";

type ContactsFilters = { q: string };

interface ContactsClientHeaderProps {
  filters: ContactsFilters;
  onFilterChange: (filters: ContactsFilters) => void;
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
  onAdd: () => void;
  canEditData: boolean;
  dictionary: Dictionary;
}

export function ContactsClientHeader({
  filters,
  onFilterChange,
  columns,
  onAdd,
  canEditData,
  dictionary,
}: ContactsClientHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 px-1">
      <div className="flex max-w-sm flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange as (filters: Record<string, unknown>) => void}
          placeholder={dictionary.contacts.search_placeholder}
          showDateFilter={false}
          showAmountFilter={false}
          className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
        />
      </div>
      <div className="flex items-center gap-2">
        <DataTableColumnsVisibility columns={columns} />
        {canEditData && (
          <Button variant="default" className="gap-1" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            {dictionary.contacts.add_button}
          </Button>
        )}
      </div>
    </div>
  );
}
