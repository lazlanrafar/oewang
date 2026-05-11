import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { status } from "elysia";

const EDITABLE_WORKSPACE_ROLES = new Set(["owner", "admin", "editor"]);
const SENSITIVE_WORKSPACE_ROLES = new Set(["owner", "admin"]);

export function normalizeWorkspaceRole(role?: string | null) {
  if (role === "member") {
    return "editor" as const;
  }

  if (
    role === "owner" ||
    role === "admin" ||
    role === "editor" ||
    role === "viewer"
  ) {
    return role;
  }

  return "viewer" as const;
}

export function canEditWorkspaceData(role?: string | null) {
  return EDITABLE_WORKSPACE_ROLES.has(normalizeWorkspaceRole(role));
}

export function canManageSensitiveWorkspace(role?: string | null) {
  return SENSITIVE_WORKSPACE_ROLES.has(normalizeWorkspaceRole(role));
}

export function assertCanEditWorkspaceData(role?: string | null) {
  if (!canEditWorkspaceData(role)) {
    throw status(
      403,
      buildError(
        ErrorCode.FORBIDDEN,
        "Editor, Admin, or Owner access required.",
      ),
    );
  }
}

export function assertCanManageSensitiveWorkspace(role?: string | null) {
  if (!canManageSensitiveWorkspace(role)) {
    throw status(
      403,
      buildError(
        ErrorCode.FORBIDDEN,
        "Admin or Owner access required.",
      ),
    );
  }
}
