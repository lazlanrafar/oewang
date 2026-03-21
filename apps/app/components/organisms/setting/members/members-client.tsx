"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Skeleton,
} from "@workspace/ui";
import { format } from "date-fns";
import { Clock, MoreHorizontal, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { cancelInvitation } from "@workspace/modules/workspace/workspace.action";

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
}

import { useAppStore } from "@/stores/app";
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
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-9 w-[200px] rounded-none" />
          <Skeleton className="h-8 w-[120px] rounded-none" />
        </div>
        <div className="border border-t-0 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 border-b last:border-0"
            >
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

export function MembersClient({ members, invitations }: MembersClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("members");
  const { dictionary, isLoading } = useAppStore();

  if (!dictionary || isLoading) {
    return <MembersSkeleton />;
  }

  const dict = dictionary.settings.members;

  const handleRefresh = () => {
    router.refresh();
  };

  const handleCancelInvitation = async (invitationId: string) => {
    const result = await cancelInvitation(invitationId);
    if (result.success) {
      toast.success(dict.toast_cancelled || "Invitation cancelled");
      handleRefresh();
    } else {
      toast.error(result.error);
    }
  };

  const common = dictionary?.settings?.common;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-tight">{dict.title}</h2>
        <p className="text-xs text-muted-foreground">{dict.description}</p>
      </div>

      <Separator className="rounded-none" />

      <div className="flex flex-col gap-6">
        <Tabs
          defaultValue="members"
          onValueChange={setActiveTab}
          className="w-full"
        >
          <div className="flex items-center justify-between mb-4">
            <TabsList className="rounded-none h-9 bg-muted/50 p-0.5">
              <TabsTrigger
                value="members"
                className="rounded-none px-6 text-xs h-8 data-[state=active]:bg-background data-[state=active]:shadow-none"
              >
                {dict.tabs.members}
              </TabsTrigger>
              <TabsTrigger
                value="invitations"
                className="rounded-none px-6 text-xs h-8 data-[state=active]:bg-background data-[state=active]:shadow-none"
              >
                {dict.tabs.invitations}
              </TabsTrigger>
            </TabsList>
            <InviteMemberDialog onSuccess={handleRefresh} />
          </div>

          <TabsContent value="members" className="mt-0 outline-none">
            <div className="border border-t">
              {members.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {dict.no_members || "No members found."}
                </div>
              ) : (
                <div>
                  {members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between p-4 border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-9 w-9 rounded-none">
                          <AvatarImage
                            src={member.profilePicture || ""}
                            alt={member.name || ""}
                            className="rounded-none"
                          />
                          <AvatarFallback className="text-xs rounded-none">
                            {(member.name || member.email || "")
                              .slice(0, 1)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">
                            {member.name || common?.na || "N/A"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {member.email}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            member.role === "owner" ? "default" : "secondary"
                          }
                          className="capitalize rounded-none font-normal text-[10px] h-5 px-2"
                        >
                          {dict.form.role.options[
                            member.role as keyof typeof dict.form.role.options
                          ] || member.role}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-none hover:bg-muted"
                            >
                              <span className="sr-only">
                                {common?.open_menu || "Open menu"}
                              </span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="rounded-none border min-w-[150px]"
                          >
                            <DropdownMenuLabel className="font-normal text-[10px] text-muted-foreground px-2 py-1.5 transition-none">
                              {common?.actions || "Actions"}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="rounded-none" />
                            <DropdownMenuItem className="text-destructive focus:text-destructive rounded-none text-xs cursor-pointer px-2 py-1.5 transition-none">
                              <Trash2 className="mr-2 h-4 w-4" />
                              {common?.remove || "Remove"}
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
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {dict.no_invitations || "No pending invitations."}
                </div>
              ) : (
                <div>
                  {invitations.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between p-4 border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-9 w-9 rounded-none bg-muted flex items-center justify-center">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">
                            {invite.email}
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {dict.invitation_status?.[invite.status] ||
                              invite.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className="capitalize rounded-none font-normal text-[10px] h-5 px-2"
                        >
                          {dict.form.role.options[
                            invite.role as keyof typeof dict.form.role.options
                          ] || invite.role}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-none hover:bg-muted"
                            >
                              <span className="sr-only">
                                {common?.open_menu || "Open menu"}
                              </span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="rounded-none border min-w-[150px]"
                          >
                            <DropdownMenuLabel className="font-normal text-[10px] text-muted-foreground px-2 py-1.5 transition-none">
                              {common?.actions || "Actions"}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="rounded-none" />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive rounded-none text-xs cursor-pointer px-2 py-1.5 transition-none"
                              onClick={() => handleCancelInvitation(invite.id)}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              {dict.cancel_invitation || "Cancel Invitation"}
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
