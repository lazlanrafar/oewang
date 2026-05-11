"use client";

import {
  Button,
  Input,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  Icons,
} from "../../atoms";
import { Combobox, type ComboboxItem } from "../../atoms/combobox";
import { cn } from "../../../lib/utils";
import { useState, useMemo, useRef, useEffect } from "react";
import { FilterList, type FilterOption } from "./filter-list";
import type { FilterRecord } from "@workspace/types";
import {
  DateRangePicker,
  DateRangePickerContent,
} from "../../molecules/date-range-picker";
import { parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";

export interface DataTableFilterFacet {
  id: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  options: { id: string; name: string; colorClass?: string }[];
  multiple?: boolean;
}

interface DataTableFilterProps<TFilters extends FilterRecord> {
  placeholder?: string;
  filters: TFilters;
  onFilterChange: (filters: TFilters) => void;
  facets?: DataTableFilterFacet[];
  statusOptions?: FilterOption[];
  statusKey?: string;
  statusLabel?: string;
  showDateFilter?: boolean;
  showAmountFilter?: boolean;
  showAttachments?: boolean;
  showSource?: boolean;
  isLoading?: boolean;
  className?: string;
  excludeKeys?: string[];
  categories?: { id: string; name: string; slug?: string | null }[];
  accounts?: { id: string; name: string; currency: string }[];
  members?: { id: string; name: string }[];
  customers?: { id: string; name: string }[];
  attachmentsFilters?: FilterOption[];
  recurringFilters?: FilterOption[];
  manualFilters?: FilterOption[];
  tags?: { id: string; name: string; slug?: string }[];
  amountRange?: [number, number];
}

function FilterMenuItem({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-3 px-3 py-2.5 cursor-default select-none items-center rounded-none text-xs outline-none focus:bg-accent data-[state=open]:bg-accent group">
        <Icon
          size={16}
          className="text-muted-foreground group-hover:text-foreground transition-colors"
        />
        <span className="flex-1">{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          sideOffset={8}
          alignOffset={-4}
          className="p-0 border border-secondary/50 rounded-none shadow-xl bg-popover min-w-[200px]"
        >
          {children}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

export function DataTableFilter<TFilters extends FilterRecord>({
  placeholder = "Search...",
  filters,
  onFilterChange,
  facets,
  statusOptions,
  statusKey = "status",
  statusLabel = "Status",
  showDateFilter = true,
  showAmountFilter = true,
  isLoading,
  className,
  showAttachments,
  showSource,
  excludeKeys,
  categories,
  accounts,
  members,
  customers,
  attachmentsFilters,
  recurringFilters,
  manualFilters,
  tags,
  amountRange,
}: DataTableFilterProps<TFilters>) {
  const getStringFilter = (key: string): string | null | undefined => {
    const value = filters[key];
    return typeof value === "string" || value === null || value === undefined
      ? value
      : undefined;
  };

  const getArrayFilter = (key: string): string[] => {
    const value = filters[key];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  };

  const [searchValue, setSearchValue] = useState(getStringFilter("q") || "");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLFormElement>(null);
  const [triggerWidth, setTriggerWidth] = useState<number | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      setTriggerWidth(containerRef.current.offsetWidth);
    }
  }, [isOpen]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    onFilterChange({ ...filters, q: value || null });
  };

  const handleClearSearch = () => {
    setSearchValue("");
    onFilterChange({ ...filters, q: null });
  };

  const handleStatusChange = (statusId: string) => {
    const key = statusKey || "status";
    const newValue = filters[key] === statusId ? null : statusId;
    onFilterChange({ ...filters, [key]: newValue });
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    onFilterChange({
      ...filters,
      start: range?.from?.toISOString() ?? null,
      end: range?.to?.toISOString() ?? null,
    });
  };

  const dateRange: DateRange | undefined = useMemo(() => {
    const start = getStringFilter("start");
    const end = getStringFilter("end");
    if (!start && !end) return undefined;
    return {
      from: start ? parseISO(start) : undefined,
      to: end ? parseISO(end) : undefined,
    };
  }, [filters]);

  const handleRemoveFilter = (removedFilters: { [key: string]: null }) => {
    onFilterChange({ ...filters, ...removedFilters });
  };

  const hasActiveFilters = useMemo(() => {
    return Object.entries(filters).some(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        key !== "q" &&
        key !== "page" &&
        key !== "limit",
    );
  }, [filters]);

  return (
    <div className={cn("flex flex-row items-center gap-3 w-full", className)}>
      <form
        className="relative flex-1 w-full max-w-sm group shrink-0"
        ref={containerRef}
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <div className="relative flex items-center">
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none transition-colors group-focus-within:text-foreground" />
            <Input
              placeholder={placeholder}
              value={searchValue}
              onChange={handleSearchChange}
              className="pl-9 pr-16 h-9 border border-border bg-secondary/10 focus-visible:ring-1 focus-visible:ring-ring/20 transition-all shadow-none placeholder:text-muted-foreground/50 rounded-none text-xs"
            />

            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {searchValue && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-transparent rounded-none"
                  onClick={handleClearSearch}
                >
                  <Icons.Clear size={14} />
                </Button>
              )}
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-none outline-none cursor-pointer",
                    (isOpen || hasActiveFilters) && "text-foreground",
                  )}
                >
                  <Icons.Filter size={15} />
                </button>
              </DropdownMenuTrigger>
            </div>
          </div>

          <DropdownMenuContent
            align="end"
            alignOffset={-4}
            sideOffset={4}
            className="rounded-none p-0 border border-secondary/50 shadow-2xl bg-popover overflow-hidden"
            style={{ width: triggerWidth ? `${triggerWidth}px` : "320px" }}
          >
            <div className="flex flex-col py-1">
              {showDateFilter && (
                <FilterMenuItem icon={Icons.CalendarMonth} label="Date">
                  <div className="w-auto min-w-[500px]">
                    <DateRangePickerContent
                      range={dateRange}
                      onSelect={handleDateSelect}
                    />
                  </div>
                </FilterMenuItem>
              )}

              {showAmountFilter && (
                <FilterMenuItem icon={Icons.Amount} label="Amount">
                  <div className="p-3 flex flex-col gap-3 min-w-[200px]">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase px-0.5">
                        Min amount
                      </span>
                      <Input
                        type="number"
                        placeholder="0.00"
                        className="h-8 text-xs rounded-none border-secondary/50 focus:border-foreground transition-colors"
                        value={getStringFilter("minAmount") || ""}
                        onChange={(e) =>
                          onFilterChange({
                            ...filters,
                            minAmount: e.target.value || null,
                          })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase px-0.5">
                        Max amount
                      </span>
                      <Input
                        type="number"
                        placeholder="Unlimited"
                        className="h-8 text-xs rounded-none border-secondary/50 focus:border-foreground transition-colors"
                        value={getStringFilter("maxAmount") || ""}
                        onChange={(e) =>
                          onFilterChange({
                            ...filters,
                            maxAmount: e.target.value || null,
                          })
                        }
                      />
                    </div>
                  </div>
                </FilterMenuItem>
              )}

              {facets?.map((facet) => (
                <FilterMenuItem
                  key={facet.id}
                  icon={facet.icon || Icons.Filter}
                  label={facet.label}
                >
                   <div className="p-0 min-w-[200px]">
                    <Combobox
                      headless
                      multiple={facet.multiple}
                      items={facet.options.map((o) => ({
                        id: o.id,
                        label: o.name,
                        colorClass: o.colorClass,
                      }))}
                      selectedItem={
                        !facet.multiple
                          ? facet.options
                              .map((o) => ({
                                id: o.id,
                                label: o.name,
                                colorClass: o.colorClass,
                              }))
                              .find((o) => o.id === getStringFilter(facet.id)) ||
                            undefined
                          : undefined
                      }
                      selectedItems={
                        facet.multiple
                          ? facet.options
                              .filter((o) =>
                                getArrayFilter(facet.id).includes(o.id),
                              )
                              .map((o) => ({
                                id: o.id,
                                label: o.name,
                                colorClass: o.colorClass,
                              }))
                          : []
                      }
                      onSelect={(item) => {
                        if (facet.multiple) {
                          const currentValues = [...getArrayFilter(facet.id)];
                          const index = currentValues.indexOf(item.id);
                          if (index > -1) {
                            currentValues.splice(index, 1);
                          } else {
                            currentValues.push(item.id);
                          }
                          onFilterChange({
                            ...filters,
                            [facet.id]:
                              currentValues.length > 0 ? currentValues : null,
                          });
                        } else {
                          onFilterChange({
                            ...filters,
                            [facet.id]:
                              filters[facet.id] === item.id ? null : item.id,
                          });
                        }
                      }}
                      searchPlaceholder={`Search ${facet.label.toLowerCase()}...`}
                      className="border-none shadow-none focus-visible:ring-0"
                      renderListItem={({ item, isChecked }) => (
                        <div className="flex items-center w-full">
                          <Icons.Check
                            className={cn(
                              "mr-2 h-3.5 w-3.5 shrink-0",
                              isChecked ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {(
                            item as ComboboxItem & { colorClass?: string }
                          ).colorClass && (
                            <div
                              className={cn(
                                "w-2.5 h-2.5 rounded-[2px] shrink-0 mr-2",
                                (item as ComboboxItem & { colorClass?: string })
                                  .colorClass,
                              )}
                            />
                          )}
                          <span className="truncate flex-1">{item.label}</span>
                        </div>
                      )}
                    />
                  </div>
                </FilterMenuItem>
              ))}

              {!facets && statusOptions && (
                <FilterMenuItem icon={Icons.Status} label={statusLabel}>
                  <div className="p-1 min-w-[180px]">
                    {statusOptions.map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option.id}
                        checked={filters[statusKey || "status"] === option.id}
                        onCheckedChange={() => handleStatusChange(option.id)}
                        className="text-xs rounded-none py-2 pr-3 focus:bg-accent cursor-default"
                      >
                        {option.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                </FilterMenuItem>
              )}

              {showAttachments && (
                <FilterMenuItem icon={Icons.Attachments} label="Attachments">
                  <div className="p-1 min-w-[180px]">
                    <DropdownMenuCheckboxItem
                      checked={filters.attachments === "include"}
                      onCheckedChange={() =>
                        onFilterChange({
                          ...filters,
                          attachments:
                            filters.attachments === "include"
                              ? null
                              : "include",
                        })
                      }
                      className="text-xs rounded-none py-2 pr-3 focus:bg-accent cursor-default"
                    >
                      Has attachments
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={filters.attachments === "exclude"}
                      onCheckedChange={() =>
                        onFilterChange({
                          ...filters,
                          attachments:
                            filters.attachments === "exclude"
                              ? null
                              : "exclude",
                        })
                      }
                      className="text-xs rounded-none py-2 pr-3 focus:bg-accent cursor-default"
                    >
                      No attachments
                    </DropdownMenuCheckboxItem>
                  </div>
                </FilterMenuItem>
              )}

              {showSource && (
                <FilterMenuItem icon={Icons.Import} label="Source">
                  <div className="p-1 min-w-[180px]">
                    <DropdownMenuCheckboxItem
                      checked={filters.manual === "include"}
                      onCheckedChange={() =>
                        onFilterChange({
                          ...filters,
                          manual:
                            filters.manual === "include" ? null : "include",
                        })
                      }
                      className="text-xs rounded-none py-2 pr-3 focus:bg-accent cursor-default"
                    >
                      Manual
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={filters.manual === "exclude"}
                      onCheckedChange={() =>
                        onFilterChange({
                          ...filters,
                          manual:
                            filters.manual === "exclude" ? null : "exclude",
                        })
                      }
                      className="text-xs rounded-none py-2 pr-3 focus:bg-accent cursor-default"
                    >
                      Bank connection
                    </DropdownMenuCheckboxItem>
                  </div>
                </FilterMenuItem>
              )}

              <div className="mt-1 pt-1 border-t border-secondary/50 px-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-[10px] h-8 font-normal text-muted-foreground hover:text-foreground rounded-none px-3"
                  onClick={() => {
                    const resetFilters = Object.keys(filters).reduce(
                      (acc, key) => ({
                        ...acc,
                        [key]: key === "q" ? getStringFilter("q") || null : null,
                      }),
                      {} as TFilters,
                    );
                    onFilterChange(resetFilters);
                  }}
                  disabled={!hasActiveFilters}
                >
                  Clear all filters
                </Button>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </form>

      <FilterList
        filters={filters}
        loading={isLoading}
        onRemove={handleRemoveFilter}
        facets={facets}
        categories={categories}
        accounts={accounts}
        members={members}
        customers={customers}
        tags={tags}
        statusFilters={statusOptions}
        attachmentsFilters={attachmentsFilters}
        recurringFilters={recurringFilters}
        manualFilters={manualFilters}
        amountRange={amountRange}
        excludeKeys={excludeKeys}
        showDateFilter={showDateFilter}
      />
    </div>
  );
}
