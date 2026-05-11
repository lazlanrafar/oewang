import type { Metadata } from "next";

import { AcceptInviteClient } from "@/components/organisms/auth/accept-invite-client";

export const metadata: Metadata = {
  title: "Accept Invitation",
};

export default async function AcceptInvitePage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.token === "string" ? searchParams.token : null;

  return <AcceptInviteClient token={token} />;
}
