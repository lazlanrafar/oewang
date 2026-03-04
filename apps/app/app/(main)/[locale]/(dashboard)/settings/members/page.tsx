import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import * as jose from "jose";

import {
  getWorkspaceInvitations,
  getWorkspaceMembers,
} from "@workspace/modules";
import { MembersClient } from "@/components/setting/members/members-client";
import { Env } from "@workspace/constants";

async function getWorkspaceIdFromToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("okane-session")?.value;
    if (!token) return null;

    // Decode without verification — workspace_id is non-sensitive routing info.
    // The API will verify the token and enforce authorization.
    const { payload } = await jose.jwtVerify(
      token,
      new TextEncoder().encode(Env.JWT_SECRET!),
    );
    return (payload.workspace_id as string) ?? null;
  } catch {
    return null;
  }
}

export default async function MembersPage() {
  const workspaceId = await getWorkspaceIdFromToken();

  if (!workspaceId) {
    redirect("/sign-in");
  }

  const [membersResult, invitationsResult] = await Promise.all([
    getWorkspaceMembers(workspaceId),
    getWorkspaceInvitations(workspaceId),
  ]);

  const members = membersResult.success ? membersResult.data : [];
  const invitations = invitationsResult.success ? invitationsResult.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Team Members</h3>
        <p className="text-sm text-muted-foreground">
          Manage who has access to this workspace.
        </p>
      </div>
      <MembersClient
        workspaceId={workspaceId}
        members={members}
        invitations={invitations}
      />
    </div>
  );
}
