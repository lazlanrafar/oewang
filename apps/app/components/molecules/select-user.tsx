"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, User as UserIcon } from "lucide-react";
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
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@workspace/ui";
import { getWorkspaceMembers } from "@workspace/modules/client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

interface Member {
  userId: string;
  name: string | null;
  email: string;
  profilePicture: string | null;
  role: string;
}

export interface SelectUserProps {
  value?: string;
  onChange: (userId: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function SelectUser({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Select user",
}: SelectUserProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const { data: members, isLoading } = useQuery({
    queryKey: ["workspace_members"],
    queryFn: async () => {
      const res = await getWorkspaceMembers();
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
    enabled: open || !!value,
  });

  const selectedMember = useMemo(() => {
    return members?.find((m: any) => m.userId === value);
  }, [members, value]);

  const filteredMembers = useMemo(() => {
    if (!searchValue || !members) return members || [];
    return members.filter(
      (m: any) =>
        m.name?.toLowerCase().includes(searchValue.toLowerCase()) ||
        m.email.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [members, searchValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex items-center gap-2 min-w-0 transition-colors group text-left w-full",
            "border h-10 transition-colors hover:bg-muted/10 px-3",
            "cursor-pointer",
            className,
          )}
        >
          {selectedMember ? (
            <Avatar className="h-4 w-4 shrink-0">
              <AvatarImage src={selectedMember.profilePicture || undefined} />
              <AvatarFallback className="text-[8px]">
                {selectedMember.name?.slice(0, 2).toUpperCase() ||
                  selectedMember.email.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-sans text-foreground truncate flex-1">
            {selectedMember?.name ||
              selectedMember?.email ||
              (isLoading ? "Loading..." : placeholder)}
          </span>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[240px]"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="font-sans" shouldFilter={false}>
          <CommandInput
            placeholder="Search member..."
            value={searchValue}
            onValueChange={setSearchValue}
            className="h-9"
          />
          <CommandList className="max-h-[300px] overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && filteredMembers.length === 0 && (
              <CommandEmpty>No member found.</CommandEmpty>
            )}

            {!isLoading && (
              <CommandGroup>
                {filteredMembers.map((member: any) => (
                  <CommandItem
                    key={member.userId}
                    value={member.email}
                    onSelect={() => {
                      onChange(member.userId);
                      setOpen(false);
                    }}
                    className="text-xs py-2 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5 shrink-0">
                        <AvatarImage src={member.profilePicture || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {member.name?.slice(0, 2).toUpperCase() ||
                            member.email.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">
                          {member.name || member.email}
                        </span>
                        {member.name && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            {member.email}
                          </span>
                        )}
                      </div>
                    </div>
                    {value === member.userId && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
