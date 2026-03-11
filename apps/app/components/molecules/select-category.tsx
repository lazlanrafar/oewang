"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
} from "@workspace/ui";
import { getCategories, createCategory } from "@workspace/modules/client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface SelectCategoryProps {
  value?: string;
  type: "income" | "expense";
  onChange: (categoryId: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function SelectCategory({
  value,
  type,
  onChange,
  className,
  disabled,
  placeholder = "Select category",
}: SelectCategoryProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const queryClient = useQueryClient();

  // Handle internal fetching
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories", type],
    queryFn: async () => {
      const res = await getCategories(type);
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
    enabled: open || !!value,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await createCategory({ name, type });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      if (data) {
        onChange(data.id);
        setOpen(false);
        setSearchValue("");
        queryClient.invalidateQueries({ queryKey: ["categories", type] });
        toast.success(`Category "${data.name}" created`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create category");
    },
  });

  const selectedCategory = categories.find((c) => c.id === value);

  const filteredCategories = useMemo(() => {
    if (!searchValue) return categories;
    return categories.filter((c) =>
      c.name.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [categories, searchValue]);

  const showCreateOption =
    searchValue.length > 0 &&
    !filteredCategories.some(
      (c) => c.name.toLowerCase() === searchValue.toLowerCase(),
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled || createMutation.isPending}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex items-center gap-2 min-w-0 transition-colors group text-left w-full",
            "border h-10 transition-colors hover:bg-muted/10 px-3",
            "cursor-pointer",
            className,
          )}
        >
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-[2px] shrink-0",
              type === "income" ? "bg-emerald-500" : "bg-red-500",
            )}
          />
          <span className="text-xs font-sans text-foreground truncate flex-1">
            {selectedCategory?.name ||
              (isLoading ? "Loading..." : "Select category")}
          </span>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[200px]"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="font-sans" shouldFilter={false}>
          <CommandInput
            placeholder="Search category..."
            value={searchValue}
            onValueChange={setSearchValue}
            className="h-9"
          />
          <CommandList
            className="max-h-[300px] overflow-y-auto"
            onWheel={(e) => e.stopPropagation()}
          >
            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading &&
              filteredCategories.length === 0 &&
              !showCreateOption && (
                <CommandEmpty>No category found.</CommandEmpty>
              )}

            {!isLoading && (
              <CommandGroup>
                {filteredCategories.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={category.name}
                    onSelect={() => {
                      onChange(category.id);
                      setOpen(false);
                    }}
                    className="text-xs py-2 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-2.5 h-2.5 rounded-[2px] shrink-0",
                          type === "income" ? "bg-emerald-500" : "bg-red-500",
                        )}
                      />
                      {category.name}
                    </div>
                    {value === category.id && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </CommandItem>
                ))}

                {showCreateOption && (
                  <CommandItem
                    value={searchValue}
                    onSelect={() => createMutation.mutate(searchValue)}
                    className="text-xs py-2 flex items-center gap-2 text-primary font-medium"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    <span>Create "{searchValue}"</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
