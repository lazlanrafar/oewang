"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Layers } from "lucide-react";
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
import { getWalletGroups, createWalletGroup } from "@workspace/modules/client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface SelectAccountGroupProps {
  value?: string;
  onChange: (groupId: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  variant?: "ghost" | "outline";
}

export function SelectAccountGroup({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Select group",
  variant = "outline",
}: SelectAccountGroupProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const queryClient = useQueryClient();

  // Handle internal fetching
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["wallet-groups"],
    queryFn: async () => {
      const res = await getWalletGroups();
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
    enabled: open || !!value,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await createWalletGroup({ name });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      if (data) {
        onChange(data.id);
        setOpen(false);
        setSearchValue("");
        queryClient.invalidateQueries({ queryKey: ["wallet-groups"] });
        toast.success(`Group "${data.name}" created`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create group");
    },
  });

  const selectedGroup = groups.find((g) => g.id === value);

  const filteredGroups = useMemo(() => {
    if (!searchValue) return groups;
    return groups.filter((g) =>
      g.name.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [groups, searchValue]);

  const showCreateOption =
    searchValue.length > 0 &&
    !filteredGroups.some(
      (g) => g.name.toLowerCase() === searchValue.toLowerCase(),
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled || createMutation.isPending}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex items-center gap-2 min-w-0 transition-colors group text-left w-full justify-between",
            variant === "outline"
              ? "border h-9 px-3"
              : "h-8 px-2 hover:bg-muted/50 rounded-md",
            "cursor-pointer",
            className,
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-sans text-foreground truncate flex-1 leading-none pt-0.5">
              {selectedGroup?.name || (isLoading ? "Loading..." : placeholder)}
            </span>
          </div>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[200px]"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="font-sans" shouldFilter={false}>
          <CommandInput
            placeholder="Search group..."
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

            {!isLoading && filteredGroups.length === 0 && !showCreateOption && (
              <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
                No group found.
              </CommandEmpty>
            )}

            {!isLoading && (
              <CommandGroup>
                {filteredGroups.map((group) => (
                  <CommandItem
                    key={group.id}
                    value={group.name}
                    onSelect={() => {
                      onChange(group.id);
                      setOpen(false);
                    }}
                    className="text-xs py-2 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="h-3 w-3 text-muted-foreground" />
                      {group.name}
                    </div>
                    {value === group.id && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </CommandItem>
                ))}

                {showCreateOption && searchValue.length > 0 && (
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
