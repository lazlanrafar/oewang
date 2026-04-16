"use client";

import { Badge, Button, Icons, Skeleton } from "../../atoms";
import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { DataTableFilterFacet } from "./data-table-filter";

export type FilterKey =
  | "start"
  | "end"
  | "minAmount"
  | "maxAmount"
  | "attachments"
  | "recurring"
  | "statuses"
  | "categories"
  | "tags"
  | "accounts"
  | "customers"
  | "assignees"
  | "owners"
  | "status"
  | "manual"
  | "type"
  | "q"
  | "page"
  | "limit";

export type FilterValue = {
  start: string;
  end: string;
  minAmount: number;
  maxAmount: number;
  attachments: string;
  recurring: string[] | boolean;
  statuses: string[];
  categories: string[];
  tags: string[];
  accounts: string[];
  customers: string[];
  assignees: string[];
  owners: string[];
  status: string;
  manual: string;
  type: string;
  q: string;
  page: number;
  limit: number;
};

export interface FilterOption {
  id: string;
  name: string;
  colorClass?: string;
}

interface Props {
  filters: Record<string, any>;
  loading?: boolean;
  onRemove: (filters: { [key: string]: null }) => void;
  facets?: DataTableFilterFacet[];
  categories?: { id: string; name: string; slug?: string | null }[];
  accounts?: { id: string; name: string; currency: string }[];
  members?: { id: string; name: string }[];
  customers?: { id: string; name: string }[];
  statusFilters?: FilterOption[];
  attachmentsFilters?: FilterOption[];
  recurringFilters?: FilterOption[];
  manualFilters?: FilterOption[];
  tags?: { id: string; name: string; slug?: string }[];
  amountRange?: [number, number];
  excludeKeys?: string[];
  showDateFilter?: boolean;
}

const formatDateRange = (start: Date, end: Date) => {
  const startFormat = format(start, "MMM d");
  const endFormat = format(end, "MMM d, yyyy");
  return `${startFormat} - ${endFormat}`;
};

const formatAccountName = (account: { name?: string; currency?: string }) => {
  if (!account.name) return "Unknown Account";
  return `${account.name}${account.currency ? ` (${account.currency.toUpperCase()})` : ""}`;
};

export function FilterList({
  filters,
  loading,
  onRemove,
  facets,
  categories,
  accounts,
  members,
  customers,
  tags,
  statusFilters,
  attachmentsFilters,
  recurringFilters,
  manualFilters,
  excludeKeys,
  showDateFilter = true,
}: Props) {
  const renderFilter = (key: string, value: any) => {
    // Check facets first for compatibility
    if (facets) {
      const facet = facets.find((f) => f.id === key);
      if (facet) {
        if (Array.isArray(value)) {
          return value
            .map((v) => facet.options.find((o) => o.id === v)?.name || v)
            .join(", ");
        }
        return facet.options.find((o) => o.id === value)?.name || value;
      }
    }

    switch (key) {
      case "start": {
        if (value && filters.end) {
          return formatDateRange(parseISO(value), parseISO(filters.end));
        }
        return value && format(parseISO(value), "MMM d, yyyy");
      }

      case "minAmount": {
        if (filters.maxAmount) return null; // Handled by maxAmount case below
        return `Min: ${Number(value).toLocaleString()}`;
      }
      case "maxAmount": {
        if (filters.minAmount) {
          return `${Number(filters.minAmount).toLocaleString()} - ${Number(value).toLocaleString()}`;
        }
        return `Max: ${Number(value).toLocaleString()}`;
      }

      case "attachments": {
        return attachmentsFilters?.find((filter) => filter.id === value)?.name;
      }

      case "recurring": {
        if (typeof value === "boolean") {
          return value ? "Recurring" : "One-time";
        }
        return (value as string[])
          ?.map(
            (slug) =>
              recurringFilters?.find((filter) => filter.id === slug)?.name,
          )
          .join(", ");
      }

      case "statuses": {
        if (!value) return null;
        return (value as string[])
          .map(
            (status) =>
              statusFilters?.find((filter) => filter.id === status)?.name,
          )
          .join(", ");
      }

      case "status": {
        if (!value) return null;
        return statusFilters?.find((filter) => filter.id === value)?.name;
      }

      case "categories": {
        if (!value) return null;
        return (value as string[])
          .map(
            (id) =>
              categories?.find((c) => c.id === id || c.slug === id)?.name || id,
          )
          .join(", ");
      }

      case "tags": {
        if (!value) return null;
        return (value as string[])
          .map(
            (id) =>
              tags?.find((tag) => tag?.id === id || tag?.slug === id)?.name || id,
          )
          .join(", ");
      }

      case "accounts": {
        if (!value) return null;
        return (value as string[])
          .map((id) => {
            const account = accounts?.find((account) => account.id === id);
            return account ? formatAccountName(account) : id;
          })
          .join(", ");
      }

      case "customers": {
        if (!value) return null;
        return (value as string[])
          .map((id) => customers?.find((c) => c.id === id)?.name || id)
          .join(", ");
      }

      case "assignees":
      case "owners": {
        if (!value) return null;
        return (value as string[])
          .map((id) => members?.find((m) => m.id === id)?.name || id)
          .join(", ");
      }

      case "manual": {
        return manualFilters?.find((filter) => filter.id === value)?.name;
      }

      case "type": {
        if (value === "income") return "In";
        if (value === "expense") return "Out";
        return value;
      }

      default:
        return String(value);
    }
  };
  const handleOnRemove = (key: string) => {
    if (key === "start" || key === "end") {
      onRemove({ start: null, end: null });
      return;
    }

    if (key === "minAmount" || key === "maxAmount") {
      onRemove({ minAmount: null, maxAmount: null });
      return;
    }

    onRemove({ [key]: null });
  };

  const activeFilters = useMemo(() => {
    return Object.entries(filters).filter(
      ([key, value]) => {
        if (value === null || value === undefined || value === "") return false;
        
        // Handle explicit excluded keys
        if (excludeKeys?.includes(key)) return false;
        
        // Handle date hiding
        if (!showDateFilter && (key === "start" || key === "end" || key === "startDate" || key === "endDate")) {
          return false;
        }

        return (
          key !== "end" &&
          key !== "endDate" &&
          key !== "q" &&
          key !== "page" &&
          key !== "limit"
        );
      }
    );
  }, [filters, excludeKeys, showDateFilter]);

  if (activeFilters.length === 0 && !loading) return null;

  const textCapitalize = (text: string) => {
    return text
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
      {loading ? (
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-none" />
          <Skeleton className="h-9 w-20 rounded-none" />
        </div>
      ) : (
        <ul className="flex gap-2">
          {activeFilters.map(([key, value]) => {
            const displayValue = renderFilter(key, value);
            if (!displayValue) return null;

            return (
              <li key={key}>
                <Button
                  className="h-9 px-2 bg-secondary hover:bg-secondary font-normal text-muted-foreground/80 flex space-x-1 items-center group rounded-none"
                  onClick={() => handleOnRemove(key)}
                  variant="secondary"
                >
                  <Icons.Clear className="scale-0 size-auto group-hover:scale-100 transition-all w-0 group-hover:w-4" />
                  <span className="text-[11px] font-medium text-foreground/90 whitespace-nowrap">
                    {textCapitalize(key)}: {displayValue}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
