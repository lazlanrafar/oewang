"use client";
import { Combobox, Spinner, cn } from "@workspace/ui";
import { Landmark } from "lucide-react";
import { getWallets, createWallet } from "@workspace/modules/client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface SelectAccountProps {
  value?: string;
  onChange: (accountId: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  headless?: boolean;
  hideLoading?: boolean;
  variant?: React.ComponentProps<typeof Combobox>["variant"];
  inDataTable?: boolean;
}

export function SelectAccount({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Select account",
  headless,
  hideLoading,
  variant,
  inDataTable,
}: SelectAccountProps) {
  const queryClient = useQueryClient();

  // Handle internal fetching
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const res = await getWallets();
      if (!res.success) throw new Error(res.message);
      return res.data || [];
    },
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
        queryClient.invalidateQueries({ queryKey: ["wallets"] });
        toast.success(`Account "${data.name}" created`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create account");
    },
  });

  const selectedAccount = accounts.find((a) => a.id === value);
  const selectedValue = selectedAccount
    ? {
        id: selectedAccount.id,
        label: selectedAccount.name,
      }
    : undefined;

  const items = accounts.map((a) => ({
    id: a.id,
    label: a.name,
  }));

  if (!selectedValue && isLoading && !hideLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center min-h-[40px]">
        <Spinner />
      </div>
    );
  }

  return (
    <Combobox
      variant={variant}
      headless={headless}
      disabled={disabled || createMutation.isPending}
      placeholder={placeholder}
      searchPlaceholder="Search account"
      items={items}
      selectedItem={selectedValue}
      onSelect={(item) => {
        onChange(item.id);
      }}
      triggerClassName={cn(
        "rounded-none",
        inDataTable && "max-w-[280px]",
        className,
      )}
      showChevron={!inDataTable}
      className="rounded-none"
      onCreate={(value) => {
        createMutation.mutate(value);
      }}
      renderSelectedItem={(item) => (
        <div className="flex items-center space-x-2">
          <Landmark className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-left truncate max-w-[90%] text-sm font-medium">
            {!Array.isArray(item) ? item.label : ""}
          </span>
        </div>
      )}
      renderOnCreate={(value) => (
        <div className="flex items-center space-x-2">
          <Landmark className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-sm">{`Create "${value}"`}</span>
        </div>
      )}
      renderListItem={({ item }) => (
        <div className="flex items-center space-x-2 py-1">
          <Landmark className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="line-clamp-1 text-sm font-medium">{item.label}</span>
        </div>
      )}
    />
  );
}
