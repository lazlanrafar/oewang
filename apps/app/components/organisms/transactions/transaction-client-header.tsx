"use client";

import type { ComponentProps } from "react";

import type { Dictionary } from "@workspace/dictionaries";
import type { Category, Wallet } from "@workspace/types";
import {
  Button,
  DataTableColumnsVisibility,
  DataTableFilter,
  DateRangePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icons,
} from "@workspace/ui";
import { parseISO } from "date-fns";
import { ChevronDown, FileDown, FileUp, Plus } from "lucide-react";

import { type GroupByInterval, TransactionGroupingSelector } from "./transaction-grouping-selector";

type FilterOption = { id: string; name: string; colorClass?: string };

interface TransactionClientHeaderProps {
  filters: {
    q: string;
    type: string;
    walletId: string | string[];
    categoryId: string[];
    startDate: string;
    endDate: string;
    minAmount: string | number | null;
    maxAmount: string | number | null;
    attachments: "include" | "exclude" | null;
  };
  onFilterChange: (filters: TransactionClientHeaderProps["filters"]) => void;
  groupBy: string;
  onGroupByChange: (value: string) => void;
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
  facets: {
    id: string;
    label: string;
    icon: ComponentProps<typeof Icons.Status>;
    options: FilterOption[];
    multiple?: boolean;
  }[];
  attachmentsFilters: FilterOption[];
  manualFilters: FilterOption[];
  categories: Category[];
  wallets: Wallet[];
  onImport: () => void;
  onExport: () => void;
  onAdd: () => void;
  canEditData: boolean;
  dictionary: Dictionary;
}

export function TransactionClientHeader({
  filters,
  onFilterChange,
  groupBy,
  onGroupByChange,
  columns,
  facets,
  attachmentsFilters,
  manualFilters,
  categories,
  wallets,
  onImport,
  onExport,
  onAdd,
  canEditData,
  dictionary,
}: TransactionClientHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange}
          placeholder={dictionary.transactions.search_placeholder}
          showDateFilter={false}
          showAmountFilter={true}
          showAttachments={true}
          showSource={true}
          facets={facets as any}
          attachmentsFilters={attachmentsFilters}
          manualFilters={manualFilters}
          excludeKeys={["startDate", "endDate"]}
          className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
          categories={categories}
          accounts={wallets}
        />
      </div>

      <div className="flex items-center gap-2">
        <TransactionGroupingSelector
          value={groupBy as GroupByInterval}
          onValueChange={onGroupByChange}
          dictionary={dictionary}
        />
        <DateRangePicker
          range={{
            from: filters.startDate ? parseISO(filters.startDate) : undefined,
            to: filters.endDate ? parseISO(filters.endDate) : undefined,
          }}
          onSelect={(range) => {
            onFilterChange({
              ...filters,
              startDate: range?.from ? range.from.toISOString() : "",
              endDate: range?.to ? range.to.toISOString() : "",
            });
          }}
        />
        <DataTableColumnsVisibility columns={columns} />

        {canEditData ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <FileUp className="h-4 w-4" />
                  <span className="ml-2 hidden text-sm sm:inline-block">
                    {dictionary.transactions.import_backfill}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onImport}>
                  <FileUp className="mr-2 h-4 w-4" />
                  {dictionary.transactions.backup_restore_device}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <FileDown className="mr-2 h-4 w-4" />
                  {dictionary.transactions.export_backup_email}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExport}>
                  <FileDown className="mr-2 h-4 w-4" />
                  {dictionary.transactions.export_data_excel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="default" className="gap-1" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              {dictionary.transactions.add_button}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onExport}>
            <FileDown className="h-4 w-4" />
            <span className="ml-2 text-sm">{dictionary.transactions.export_data_excel}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
