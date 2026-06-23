export function resolveWorkspaceIdFromBody(body: {
  workspaceId?: string | null;
  workspace_id?: string | null;
}): string | null {
  const camel = body.workspaceId?.trim();
  if (camel) return camel;

  const snake = body.workspace_id?.trim();
  if (snake) return snake;

  return null;
}

/**
 * Decide which workspace id to embed in a freshly minted JWT.
 *
 * Only honors [stored] (the `users.workspace_id` column) when the user is
 * still an *active* member of it — otherwise the token would carry a workspace
 * the auth guard rejects, 401-ing every request. Falls back to the first
 * active membership, or `""` (no workspace → onboarding).
 */
export function pickActiveWorkspaceId(
  stored: string | null | undefined,
  activeWorkspaceIds: string[],
): string {
  if (stored && activeWorkspaceIds.includes(stored)) return stored;
  return activeWorkspaceIds[0] ?? "";
}
