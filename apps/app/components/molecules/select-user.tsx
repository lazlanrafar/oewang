"use client";

import * as React from "react";
import {
  Combobox,
  Spinner,
  Avatar,
  AvatarImage,
  AvatarFallback,
  cn,
} from "@workspace/ui";
import { User } from "lucide-react";
import { getWorkspaceMembers } from "@workspace/modules/client";
import { getInitials } from "@workspace/utils";
import { useQuery } from "@tanstack/react-query";

interface Member {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
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
      // Map old structure to new structure expected by Combobox
      return (res.data || []).map((member: any) => ({
        id: member.userId,
        name: member.name,
        email: member.email,
        image: member.profilePicture,
        role: member.role,
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

  const items = members.map((m) => ({
    id: m.id,
    label: m.name || m.email,
    email: m.email,
    image: m.image,
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
      renderSelectedItem={(item: any) => (
        <div className="flex items-center space-x-2">
          <Avatar className="w-6 h-6">
            <AvatarImage src={item.image} alt={item.label} />
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
              {getInitials(item.label)}
            </AvatarFallback>
          </Avatar>
          <span className="text-left truncate max-w-[90%] font-medium text-xs">
            {item.label}
          </span>
        </div>
      )}
      renderListItem={({ item }: { item: any }) => (
        <div className="flex items-center gap-2 overflow-hidden">
          <Avatar className="w-6 h-6">
            <AvatarImage src={item.image} alt={item.label} />
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
              {getInitials(item.label)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col truncate">
            <span className="font-medium truncate text-xs">{item.label}</span>
            <span className="text-[10px] text-muted-foreground truncate">
              {item.email}
            </span>
          </div>
        </div>
      )}
    />
  );
}
