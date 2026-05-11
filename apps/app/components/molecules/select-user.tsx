"use client";

import type * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { getWorkspaceMembers } from "@workspace/modules/client";
import { Avatar, AvatarFallback, AvatarImage, Combobox, cn, Spinner } from "@workspace/ui";
import { getInitials } from "@workspace/utils";

interface Member {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
}

interface WorkspaceMemberResponse {
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  profilePicture?: string | null;
  role?: string | null;
}

interface UserComboboxItem {
  id: string;
  label: string;
  email: string;
  image: string | null;
}

export interface SelectUserProps {
  value?: string;
  onChange: (userId: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  headless?: boolean;
  hideLoading?: boolean;
  variant?: React.ComponentProps<typeof Combobox>["variant"];
  inDataTable?: boolean;
}

export function SelectUser({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Select user",
  headless,
  hideLoading,
  variant,
  inDataTable,
}: SelectUserProps) {
  // Handle internal fetching
  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["workspace-members"],
    queryFn: async () => {
      const res = await getWorkspaceMembers();
      if (!res.success) throw new Error(res.error);
      const membersData: WorkspaceMemberResponse[] = Array.isArray(res.data) ? res.data : [];
      return membersData.map((member) => ({
        id: String(member.userId ?? ""),
        name: member.name ?? null,
        email: String(member.email ?? ""),
        image: member.profilePicture ?? null,
        role: String(member.role ?? ""),
      }));
    },
  });

  const selectedMember = members.find((m) => m.id === value);
  const selectedValue = selectedMember
    ? {
        id: selectedMember.id,
        label: selectedMember.name || selectedMember.email,
        email: selectedMember.email,
        image: selectedMember.image,
      }
    : undefined;

  const items: UserComboboxItem[] = members.map((m) => ({
    id: m.id,
    label: m.name || m.email,
    email: m.email,
    image: m.image,
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
      disabled={disabled}
      placeholder={placeholder}
      searchPlaceholder="Search user"
      items={items}
      selectedItem={selectedValue}
      onSelect={(item) => {
        onChange(item.id);
      }}
      triggerClassName={cn(inDataTable && "max-w-[280px]", className)}
      showChevron={!inDataTable}
      className="rounded-none"
      renderSelectedItem={(item: UserComboboxItem | UserComboboxItem[]) => {
        const selected = Array.isArray(item) ? item[0] : item;
        if (!selected) return null;

        return (
          <div className="flex items-center space-x-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={selected.image || undefined} alt={selected.label} />
              <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                {getInitials(selected.label)}
              </AvatarFallback>
            </Avatar>
            <span className="max-w-[90%] truncate text-left font-medium text-xs">{selected.label}</span>
          </div>
        );
      }}
      renderListItem={({ item }: { item: UserComboboxItem }) => (
        <div className="flex items-center gap-2 overflow-hidden">
          <Avatar className="h-6 w-6">
            <AvatarImage src={item.image || undefined} alt={item.label} />
            <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
              {getInitials(item.label)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col truncate">
            <span className="truncate font-medium text-xs">{item.label}</span>
            <span className="truncate text-[10px] text-muted-foreground">{item.email}</span>
          </div>
        </div>
      )}
    />
  );
}
