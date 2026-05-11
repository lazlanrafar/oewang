import { redirect } from "next/navigation";

import { getMe } from "@workspace/modules/user/user.action";

import {
  canManageSensitiveWorkspace,
  getActiveWorkspaceRole,
} from "./workspace-permissions";

export async function requireSensitiveWorkspaceAccess(locale: string) {
  const meResult = await getMe();

  if (!meResult.success || !meResult.data) {
    redirect(`/${locale}/unauthorized`);
  }

  const role = getActiveWorkspaceRole({
    workspaceId: meResult.data.user.workspace_id,
    workspaces: meResult.data.workspaces,
  });

  if (!canManageSensitiveWorkspace(role)) {
    redirect(`/${locale}/unauthorized`);
  }

  return role;
}
