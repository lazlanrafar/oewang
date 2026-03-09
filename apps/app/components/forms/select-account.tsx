"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Landmark } from "lucide-react";
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
import { getWallets, createWallet } from "@workspace/modules/client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface SelectAccountProps {
  value?: string;
  onChange: (accountId: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function SelectAccount({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Select account",
}: SelectAccountProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const queryClient = useQueryClient();

  // Handle internal fetching
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const res = await getWallets();
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await createWallet({ name });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      if (data) {
        onChange(data.id);
        setOpen(false);
        setSearchValue("");
        queryClient.invalidateQueries({ queryKey: ["wallets"] });
        toast.success(`Account "${data.name}" created`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create account");
    },
  });

  const selectedAccount = accounts.find((a) => a.id === value);

  const filteredAccounts = useMemo(() => {
    if (!searchValue) return accounts;
    return accounts.filter((a) =>
      a.name.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [accounts, searchValue]);

  const showCreateOption =
    searchValue.length > 0 &&
    !filteredAccounts.some(
      (a) => a.name.toLowerCase() === searchValue.toLowerCase(),
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled || createMutation.isPending}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex items-center gap-2 min-w-0 hover:bg-accent/50 p-1 rounded transition-colors group text-left w-full",
            className,
          )}
        >
          <Landmark className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-sans text-foreground truncate flex-1">
            {selectedAccount?.name || (isLoading ? "Loading..." : placeholder)}
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
            placeholder="Search account..."
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
              filteredAccounts.length === 0 &&
              !showCreateOption && (
                <CommandEmpty>No account found.</CommandEmpty>
              )}

            {!isLoading && (
              <CommandGroup>
                {filteredAccounts.map((account) => (
                  <CommandItem
                    key={account.id}
                    value={account.name}
                    onSelect={() => {
                      onChange(account.id);
                      setOpen(false);
                    }}
                    className="text-xs py-2 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Landmark className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {account.name}
                    </div>
                    {value === account.id && (
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
