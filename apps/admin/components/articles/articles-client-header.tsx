"use client";

import type { ComponentProps } from "react";

import { Button, DataTableColumnsVisibility, DataTableFilter, Icons } from "@workspace/ui";

export type ArticleFilters = {
  q: string;
  status: string | null;
};

type FilterOption = { id: string; name: string };

interface ArticlesClientHeaderProps {
  filters: ArticleFilters;
  onFilterChange: (filters: ArticleFilters) => void;
  statusOptions: FilterOption[];
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
  onCreate: () => void;
}

export function ArticlesClientHeader({
  filters,
  onFilterChange,
  statusOptions,
  columns,
  onCreate,
}: ArticlesClientHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange as never}
          statusOptions={statusOptions}
          placeholder="Search articles..."
          showDateFilter={false}
          showAmountFilter={false}
          className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onCreate}>
          <Icons.Add size={17} />
        </Button>
        <DataTableColumnsVisibility columns={columns} />
      </div>
    </div>
  );
}
