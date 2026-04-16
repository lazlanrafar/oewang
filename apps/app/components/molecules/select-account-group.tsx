"use client";

import {
  Combobox,
  Spinner,
  cn,
} from "@workspace/ui";
import { Layers } from "lucide-react";
import { getWalletGroups, createWalletGroup } from "@workspace/modules/client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface SelectAccountGroupProps {
  value?: string;
  onChange: (groupId: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  headless?: boolean;
  hideLoading?: boolean;
  variant?: React.ComponentProps<typeof Combobox>["variant"];
}

export function SelectAccountGroup({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Select group",
  variant,
  headless,
  hideLoading,
}: SelectAccountGroupProps) {
  const queryClient = useQueryClient();

  // Handle internal fetching
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["wallet-groups"],
    queryFn: async () => {
      const res = await getWalletGroups();
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
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
        queryClient.invalidateQueries({ queryKey: ["wallet-groups"] });
        toast.success(`Group "${data.name}" created`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create group");
    },
  });

  const selectedGroup = groups.find((g) => g.id === value);
  const selectedValue = selectedGroup
    ? {
        id: selectedGroup.id,
        label: selectedGroup.name,
      }
    : undefined;

  const items = groups.map((g) => ({
    id: g.id,
    label: g.name,
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
      searchPlaceholder="Search group"
      items={items}
      selectedItem={selectedValue}
      onSelect={(item) => {
        onChange(item.id);
      }}
      className={className}
      onCreate={(value) => {
        createMutation.mutate(value);
      }}
      renderSelectedItem={(item) => (
        <div className="flex items-center space-x-2">
          <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-left truncate max-w-[90%]">
            {!Array.isArray(item) ? item.label : ""}
          </span>
        </div>
      )}
      renderOnCreate={(value) => (
        <div className="flex items-center space-x-2">
          <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>{`Create "${value}"`}</span>
        </div>
      )}
      renderListItem={({ item }) => (
        <div className="flex items-center space-x-2">
          <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="line-clamp-1 font-medium">{item.label}</span>
        </div>
      )}
    />
  );
}
