import { getWorkspaceInvitations, getWorkspaceMembers } from "@workspace/modules/server";
import type { Metadata } from "next";

import { MembersClient } from "@/components/organisms/setting/members/members-client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { requireSensitiveWorkspaceAccess } from "@/lib/workspace-permissions.server";

export const metadata: Metadata = {
  title: "Members | Settings",
};

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export default async function MembersPage({ params }: Props) {
  const { locale } = await params;
  await requireSensitiveWorkspaceAccess(locale);
  const dictionary = await getDictionary(locale as Locale);

  const [membersResult, invitationsResult] = await Promise.all([getWorkspaceMembers(), getWorkspaceInvitations()]);

  const members = membersResult.success ? membersResult.data : [];
  const invitations = invitationsResult.success ? invitationsResult.data : [];

  return <MembersClient members={members} invitations={invitations} dictionary={dictionary} />;
}
