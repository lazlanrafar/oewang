import type { Workspace, WorkspaceRole, WorkspaceWithRole } from "@workspace/types";

export function normalizeWorkspaceRole(role?: string | null): WorkspaceRole {
  if (role === "member") {
    return "editor";
  }

  if (
    role === "owner" ||
    role === "admin" ||
    role === "editor" ||
    role === "viewer"
  ) {
    return role;
  }

  return "viewer";
}

export function getActiveWorkspaceRole(input: {
  workspaceId?: string | null;
  workspace?: Pick<Workspace, "current_user_role"> | null;
  workspaces?: Array<Pick<WorkspaceWithRole, "id" | "role">> | null;
}) {
  if (input.workspace?.current_user_role) {
    return normalizeWorkspaceRole(input.workspace.current_user_role);
  }

  const activeWorkspace = input.workspaces?.find(
    (workspace) => workspace.id === input.workspaceId,
  );

  return normalizeWorkspaceRole(activeWorkspace?.role);
}

export function canEditWorkspaceData(role?: string | null) {
  const normalizedRole = normalizeWorkspaceRole(role);
  return (
    normalizedRole === "owner" ||
    normalizedRole === "admin" ||
    normalizedRole === "editor"
  );
}

export function canManageSensitiveWorkspace(role?: string | null) {
  const normalizedRole = normalizeWorkspaceRole(role);
  return normalizedRole === "owner" || normalizedRole === "admin";
}
