"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, Loader2 } from "lucide-react";
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
import { getCategories } from "@workspace/modules/category/category.action";
import type { Category } from "@workspace/types";
import { useEffect, useState } from "react";

interface SelectCategoryProps {
  selectedCategoryId?: string;
  selectedCategoryName?: string;
  type: "income" | "expense";
  onChange: (categoryId: string) => void;
  className?: string;
  disabled?: boolean;
}

export function SelectCategory({
  selectedCategoryId,
  selectedCategoryName,
  type,
  onChange,
  className,
  disabled,
}: SelectCategoryProps) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    async function fetchCategories() {
      setLoading(true);
      const res = await getCategories(type);
      if (res.success && res.data) {
        setCategories(res.data);
      }
      setLoading(false);
    }

    if (open && categories.length === 0) {
      fetchCategories();
    }
  }, [open, type, categories.length]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex items-center gap-2 min-w-0 hover:bg-accent/50 p-1 rounded transition-colors group text-left w-full",
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
              selectedCategoryName ||
              "Select category"}
          </span>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[200px]"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="font-sans">
          <CommandInput
            placeholder="Search category..."
            value={searchValue}
            onValueChange={setSearchValue}
            className="h-9"
          />
          <CommandList className="max-h-[300px] overflow-y-auto no-scrollbar">
            <CommandEmpty>
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                "No category found."
              )}
            </CommandEmpty>
            <CommandGroup>
              {categories.map((category) => (
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
                  {selectedCategoryId === category.id && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
