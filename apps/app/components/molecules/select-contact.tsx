"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContact, getContacts } from "@workspace/modules/client";
import type { Contact } from "@workspace/types";
import { Combobox, Spinner } from "@workspace/ui";
import { User } from "lucide-react";
import { toast } from "sonner";

export interface SelectContactProps {
  value?: string;
  onChange: (contactId: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  headless?: boolean;
  hideLoading?: boolean;
  variant?: React.ComponentProps<typeof Combobox>["variant"];
}

export function SelectContact({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Select contact",
  headless,
  hideLoading,
  variant,
}: SelectContactProps) {
  const queryClient = useQueryClient();

  // Handle internal fetching
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await getContacts();
      if (!res.success) throw new Error(res.message);
      return res.data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await createContact({ name });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      if (data) {
        onChange(data.id);
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
        toast.success(`Contact "${data.name}" created`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create contact");
    },
  });

  const selectedContact = contacts.find((c) => c.id === value);
  const selectedValue = selectedContact
    ? {
        id: selectedContact.id,
        label: selectedContact.name,
        email: selectedContact.email,
      }
    : undefined;

  const items = contacts.map((c: Contact) => ({
    id: c.id,
    label: c.name,
    email: c.email,
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
      searchPlaceholder="Search contact"
      items={items}
      selectedItem={selectedValue}
      onSelect={(item) => {
        onChange(item.id);
      }}
      className={className}
      onCreate={(value) => {
        createMutation.mutate(value);
      }}
      renderSelectedItem={(item: Record<string, string>) => (
        <div className="flex items-center space-x-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-3 w-3 text-muted-foreground" />
          </div>
          <span className="max-w-[90%] truncate text-left font-medium text-xs">{item.label}</span>
        </div>
      )}
      renderOnCreate={(value) => (
        <div className="flex items-center space-x-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-3 w-3 text-muted-foreground" />
          </div>
          <span className="text-xs">{`Create "${value}"`}</span>
        </div>
      )}
      renderListItem={({ item }: { item: Record<string, string> }) => (
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="flex flex-col truncate">
            <span className="truncate font-medium text-xs">{item.label}</span>
            {item.email && <span className="truncate text-[10px] text-muted-foreground">{item.email}</span>}
          </div>
        </div>
      )}
    />
  );
}
