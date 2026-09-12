"use client";

import type { ComponentProps } from "react";

import type { DataTableFilterFacet } from "@workspace/ui";
import { DataTableColumnsVisibility, DataTableFilter } from "@workspace/ui";

export type FeedbackFilters = {
  q: string;
  status?: string;
  type?: string;
  source?: string;
};

const FACETS: DataTableFilterFacet[] = [
  {
    id: "status",
    label: "Status",
    options: [
      { id: "new", name: "New" },
      { id: "in_review", name: "In review" },
      { id: "planned", name: "Planned" },
      { id: "resolved", name: "Resolved" },
      { id: "rejected", name: "Rejected" },
    ],
  },
  {
    id: "type",
    label: "Type",
    options: [
      { id: "bug", name: "Bug" },
      { id: "feature_request", name: "Feature request" },
      { id: "other", name: "Other" },
    ],
  },
  {
    id: "source",
    label: "Source",
    options: [
      { id: "website", name: "Website" },
      { id: "native", name: "Native" },
    ],
  },
];

interface FeedbackClientHeaderProps {
  filters: FeedbackFilters;
  onFilterChange: (filters: FeedbackFilters) => void;
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
}

export function FeedbackClientHeader({
  filters,
  onFilterChange,
  columns,
}: FeedbackClientHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange as never}
          placeholder="Search feedback..."
          facets={FACETS}
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
