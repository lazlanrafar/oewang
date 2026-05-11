"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import type { Dictionary } from "@workspace/dictionaries";
import { cancelInvitation } from "@workspace/modules/workspace/workspace.action";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui";
import { Clock, MoreHorizontal, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { InviteMemberDialog } from "./invite-member-dialog";

interface Member {
  userId: string;
  name: string | null;
  email: string;
  profilePicture: string | null;
  role: string;
  joinedAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "expired";
  expiresAt: string;
  createdAt: string;
}

interface MembersClientProps {
  members: Member[];
  invitations: Invitation[];
  dictionary: Dictionary;
}

import { Separator } from "@workspace/ui";

export function MembersSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-6 w-32 rounded-none" />
        <Skeleton className="h-4 w-64 rounded-none" />
      </div>
      <Separator className="rounded-none" />
      <div className="flex flex-col gap-6">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-9 w-[200px] rounded-none" />
          <Skeleton className="h-8 w-[120px] rounded-none" />
        </div>
        <div className="overflow-hidden border border-t-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between border-b p-4 last:border-0">
              <div className="flex items-center gap-4">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[120px] rounded-none" />
                  <Skeleton className="h-3 w-[180px] rounded-none" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-12 rounded-none" />
                <Skeleton className="h-8 w-8 rounded-none" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MembersClient({ members, invitations, dictionary }: MembersClientProps) {
  const router = useRouter();
  const [_activeTab, setActiveTab] = useState("members");

  const settingsDict = dictionary.settings.members;

  const handleRefresh = () => {
    router.refresh();
  };

  const handleCancelInvitation = async (invitationId: string) => {
    const result = await cancelInvitation(invitationId);
    if (result.success) {
      toast.success(settingsDict.toast_cancelled || "Invitation cancelled");
      handleRefresh();
    } else {
      toast.error(result.error);
    }
  };

  const common = dictionary.settings.common;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="font-medium text-lg tracking-tight">{settingsDict.title}</h2>
        <p className="text-muted-foreground text-xs">{settingsDict.description}</p>
      </div>

      <Separator className="rounded-none" />

      <div className="flex flex-col gap-6">
        <Tabs defaultValue="members" onValueChange={setActiveTab} className="w-full">
          <div className="mb-4 flex items-center justify-between">
            <TabsList className="h-9 rounded-none bg-muted/50 p-0.5">
              <TabsTrigger
                value="members"
                className="h-8 rounded-none px-6 text-xs data-[state=active]:bg-background data-[state=active]:shadow-none"
              >
                {settingsDict.tabs.members}
              </TabsTrigger>
              <TabsTrigger
                value="invitations"
                className="h-8 rounded-none px-6 text-xs data-[state=active]:bg-background data-[state=active]:shadow-none"
              >
                {settingsDict.tabs.invitations}
              </TabsTrigger>
            </TabsList>
            <InviteMemberDialog onSuccess={handleRefresh} dictionary={dictionary} />
          </div>

          <TabsContent value="members" className="mt-0 outline-none">
            <div className="border border-t">
              {members.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  {settingsDict.no_members || "No members found."}
                </div>
              ) : (
                <div>
                  {members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between border-b p-4 transition-colors last:border-0 hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-9 w-9 rounded-none">
                          <AvatarImage
                            src={member.profilePicture || ""}
                            alt={member.name || ""}
                            className="rounded-none"
                          />
                          <AvatarFallback className="rounded-none text-xs">
                            {(member.name || member.email || "").slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">{member.name || common.na || "N/A"}</span>
                          <span className="text-muted-foreground text-xs">{member.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={member.role === "owner" ? "default" : "secondary"}
                          className="h-5 rounded-none px-2 font-normal text-[10px] capitalize"
                        >
                          {settingsDict.form.role.options[member.role as keyof typeof settingsDict.form.role.options] ||
                            member.role}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 rounded-none p-0 hover:bg-muted">
                              <span className="sr-only">{common.open_menu || "Open menu"}</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[150px] rounded-none border">
                            <DropdownMenuLabel className="px-2 py-1.5 font-normal text-[10px] text-muted-foreground transition-none">
                              {common.actions || "Actions"}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="rounded-none" />
                            <DropdownMenuItem className="cursor-pointer rounded-none px-2 py-1.5 text-destructive text-xs transition-none focus:text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              {common.remove || "Remove"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="invitations" className="mt-0 outline-none">
            <div className="border border-t">
              {invitations.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  {settingsDict.no_invitations || "No pending invitations."}
                </div>
              ) : (
                <div>
                  {invitations.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between border-b p-4 transition-colors last:border-0 hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-none bg-muted">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">{invite.email}</span>
                          <span className="text-muted-foreground text-xs capitalize">
                            {settingsDict.invitation_status[invite.status] || invite.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="h-5 rounded-none px-2 font-normal text-[10px] capitalize">
                          {settingsDict.form.role.options[invite.role as keyof typeof settingsDict.form.role.options] ||
                            invite.role}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 rounded-none p-0 hover:bg-muted">
                              <span className="sr-only">{common.open_menu || "Open menu"}</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[150px] rounded-none border">
                            <DropdownMenuLabel className="px-2 py-1.5 font-normal text-[10px] text-muted-foreground transition-none">
                              {common.actions || "Actions"}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="rounded-none" />
                            <DropdownMenuItem
                              className="cursor-pointer rounded-none px-2 py-1.5 text-destructive text-xs transition-none focus:text-destructive"
                              onClick={() => handleCancelInvitation(invite.id)}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              {settingsDict.cancel_invitation || "Cancel Invitation"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
