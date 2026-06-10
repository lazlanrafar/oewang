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
