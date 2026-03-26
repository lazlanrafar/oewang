import {
  getWorkspaceInvitations,
  getWorkspaceMembers,
} from "@workspace/modules/server";
import { MembersClient } from "@/components/organisms/setting/members/members-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Members | Settings",
};

export default async function MembersPage() {
  const [membersResult, invitationsResult] = await Promise.all([
    getWorkspaceMembers(),
    getWorkspaceInvitations(),
  ]);

  const members = membersResult.success ? membersResult.data : [];
  const invitations = invitationsResult.success ? invitationsResult.data : [];

  return <MembersClient members={members} invitations={invitations} />;
}
