"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus, User } from "lucide-react";
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
import { getCustomers, createCustomer } from "@workspace/modules/client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface SelectCustomerProps {
  value?: string;
  onChange: (customerId: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function SelectCustomer({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Select customer",
}: SelectCustomerProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const queryClient = useQueryClient();

  // Handle internal fetching
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const res = await getCustomers();
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
    enabled: open || !!value,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await createCustomer({
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      if (data) {
        onChange(data.id);
        setOpen(false);
        setSearchValue("");
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        toast.success(`Customer "${data.name}" created`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create customer");
    },
  });

  const selectedCustomer = customers.find((c) => c.id === value);

  const filteredCustomers = useMemo(() => {
    if (!searchValue) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(searchValue.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [customers, searchValue]);

  const showCreateOption =
    searchValue.length > 0 &&
    !filteredCustomers.some(
      (c) => c.name.toLowerCase() === searchValue.toLowerCase(),
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled || createMutation.isPending}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex items-center gap-2 min-w-0 transition-colors group text-left w-full h-9",
            "border-b border-transparent hover:bg-muted/10 transition-colors px-0",
            "cursor-pointer",
            className,
          )}
        >
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-xs font-sans text-foreground truncate flex-1 uppercase tracking-wider font-medium">
            {selectedCustomer?.name || (isLoading ? "Loading..." : placeholder)}
          </span>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[240px]"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="font-sans" shouldFilter={false}>
          <CommandInput
            placeholder="Search customer..."
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
              filteredCustomers.length === 0 &&
              !showCreateOption && (
                <CommandEmpty className="py-4 text-xs text-center text-muted-foreground">
                  No customer found.
                </CommandEmpty>
              )}

            {!isLoading && (
              <CommandGroup>
                {filteredCustomers.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    value={customer.name}
                    onSelect={() => {
                      onChange(customer.id);
                      setOpen(false);
                    }}
                    className="text-xs py-2 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col truncate">
                        <span className="font-medium truncate">
                          {customer.name}
                        </span>
                        {customer.email && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            {customer.email}
                          </span>
                        )}
                      </div>
                    </div>
                    {value === customer.id && (
                      <Check className="h-3.5 w-3.5 text-primary ml-2 shrink-0" />
                    )}
                  </CommandItem>
                ))}

                {showCreateOption && (
                  <CommandItem
                    value={searchValue}
                    onSelect={() => createMutation.mutate(searchValue)}
                    className="text-xs py-2 flex items-center gap-2 text-primary font-medium cursor-pointer"
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
