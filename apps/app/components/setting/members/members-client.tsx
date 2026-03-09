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

export function MembersClient({ members, invitations }: MembersClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("members");

  const handleRefresh = () => {
    router.refresh();
  };

  const handleCancelInvitation = async (invitationId: string) => {
    const result = await cancelInvitation(invitationId);
    if (result.success) {
      toast.success("Invitation cancelled");
      handleRefresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Members</h2>
        <InviteMemberDialog onSuccess={handleRefresh} />
      </div>

      <Tabs
        defaultValue="members"
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invitations">Pending Invitations</TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="mt-4 space-y-3">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between p-4 rounded-xl border bg-card text-card-foreground"
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={member.profilePicture || ""}
                    alt={member.name || ""}
                  />
                  <AvatarFallback>
                    {(member.name || member.email || "")
                      .slice(0, 1)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium leading-none">
                    {member.name || "N/A"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {member.email}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={member.role === "owner" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {member.role}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="invitations" className="mt-4 space-y-3">
          {invitations.length === 0 && (
            <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed text-center text-muted-foreground">
              No pending invitations.
            </div>
          )}
          {invitations.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between p-4 rounded-xl border bg-card text-card-foreground shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium leading-none">
                    {invite.email}
                  </span>
                  <span className="text-sm text-muted-foreground capitalize">
                    {invite.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="capitalize">
                  {invite.role}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleCancelInvitation(invite.id)}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancel Invitation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
