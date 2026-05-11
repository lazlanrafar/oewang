"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWalletGroup, getWalletGroups } from "@workspace/modules/client";
import { Combobox, Spinner } from "@workspace/ui";
import { Layers } from "lucide-react";
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
  popoverProps?: React.ComponentProps<typeof Combobox>["popoverProps"];
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
  popoverProps,
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
    onError: (error: Error) => {
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
      <div className="flex h-full min-h-[40px] w-full items-center justify-center">
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
      popoverProps={popoverProps}
      onCreate={(value) => {
        createMutation.mutate(value);
      }}
      renderSelectedItem={(item) => (
        <div className="flex items-center space-x-2">
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[90%] truncate text-left">{!Array.isArray(item) ? item.label : ""}</span>
        </div>
      )}
      renderOnCreate={(value) => (
        <div className="flex items-center space-x-2">
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>{`Create "${value}"`}</span>
        </div>
      )}
      renderListItem={({ item }) => (
        <div className="flex items-center space-x-2">
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="line-clamp-1 font-medium">{item.label}</span>
        </div>
      )}
    />
  );
}
