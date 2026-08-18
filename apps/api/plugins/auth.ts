import { Env } from "@workspace/constants";
import {
  and,
  db,
  eq,
  isNull,
  user_workspaces,
  users,
  workspaces,
} from "@workspace/database";
import { Elysia } from "elysia";
import * as jose from "jose";
import { cacheDel, cacheGet, cacheSet } from "../lib/cache";
import { normalizeWorkspaceRole } from "../modules/workspaces/workspace-permissions";

// Per-user membership snapshot cached in Redis to keep the auth resolution off
// the DB on the hot path. Short TTL bounds staleness; mutations that change
// membership/role should call invalidateAuthCache(user_id) for immediacy.
const AUTH_CACHE_TTL = 30;
const authCacheKey = (userId: string) => `auth:user:${userId}`;

type AuthUserData = {
  id: string;
  email: string;
  default_workspace_id: string | null;
  system_role: import("@workspace/constants").SystemRole | null;
  memberships: { workspace_id: string; role: string | null }[];
};

export async function invalidateAuthCache(userId: string): Promise<void> {
  await cacheDel(authCacheKey(userId));
}

const JWT_SECRET_KEY = () => new TextEncoder().encode(Env.JWT_SECRET!);

/**
 * Generate an app JWT with { user_id, workspace_id }.
 */
export type AuthContext = {
  auth: {
    user_id: string;
    workspace_id: string;
    workspaceId: string;
    workspace_role: import("@workspace/types").WorkspaceRole;
    workspaceRole: import("@workspace/types").WorkspaceRole;
    email: string;
    system_role: import("@workspace/constants").SystemRole;
  } | null;
};

async function generateJwt(
  user_id: string,
  workspaceId: string,
  email: string,
  system_role: import("@workspace/constants").SystemRole = "user",
): Promise<string> {
  const expires_in = Env.JWT_EXPIRES_IN ?? "7d";
  const jwt = await new jose.SignJWT({
    user_id,
    workspace_id: workspaceId,
    email,
    system_role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires_in)
    .sign(JWT_SECRET_KEY());

  return jwt;
}

/**
 * Verify and decode an app JWT.
 */
async function verifyJwt(token: string): Promise<{
  user_id: string;
  workspace_id: string;
  email?: string;
  system_role?: import("@workspace/constants").SystemRole;
} | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET_KEY());
    const user_id = payload.user_id as string;
    const workspace_id =
      (payload.workspace_id as string | undefined) ??
      (payload.workspaceId as string | undefined) ??
      "";
    const email = payload.email as string;
    const system_role = payload.system_role as
      | import("@workspace/constants").SystemRole
      | undefined;

    if (!user_id) return null; // workspace_id can be empty string
    return { user_id, workspace_id, email, system_role };
  } catch {
    return null;
  }
}

function resolveWorkspaceId(
  preferredWorkspaceId: string | null | undefined,
  membershipWorkspaceIds: string[],
) {
  if (
    preferredWorkspaceId &&
    membershipWorkspaceIds.includes(preferredWorkspaceId)
  ) {
    return preferredWorkspaceId;
  }

  return membershipWorkspaceIds[0] ?? "";
}

/**
 * Auth plugin — provides derive context and guard macro.
 * Verifies the oewang-session JWT (HS256). Sets auth on context, null if unauthenticated.
 *
 * Runs before every handler, so this is the hottest DB path in the API: the
 * user row and all active memberships (+ roles) come back in ONE round trip
 * instead of the previous three sequential queries.
 */
async function fetchAuthUserData(userId: string): Promise<AuthUserData | null> {
  const cached = await cacheGet<AuthUserData>(authCacheKey(userId));
  if (cached) return cached;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      default_workspace_id: users.workspace_id,
      system_role: users.system_role,
      membership_workspace_id: user_workspaces.workspace_id,
      membership_role: user_workspaces.role,
      // Non-null only when the membership's workspace is alive.
      live_workspace_id: workspaces.id,
    })
    .from(users)
    .leftJoin(
      user_workspaces,
      and(
        eq(user_workspaces.user_id, users.id),
        isNull(user_workspaces.deleted_at),
      ),
    )
    .leftJoin(
      workspaces,
      and(
        eq(workspaces.id, user_workspaces.workspace_id),
        isNull(workspaces.deleted_at),
      ),
    )
    .where(eq(users.id, userId));

  const db_user = rows[0];
  if (!db_user) return null;

  const memberships: AuthUserData["memberships"] = [];
  for (const row of rows) {
    if (row.membership_workspace_id && row.live_workspace_id) {
      memberships.push({
        workspace_id: row.membership_workspace_id,
        role: row.membership_role,
      });
    }
  }

  const data: AuthUserData = {
    id: db_user.id,
    email: db_user.email,
    default_workspace_id: db_user.default_workspace_id,
    system_role: db_user.system_role,
    memberships,
  };
  await cacheSet(authCacheKey(userId), data, AUTH_CACHE_TTL);
  return data;
}

export async function getAuth(token: string) {
  const jwt_payload = await verifyJwt(token);
  if (!jwt_payload) return null;

  const db_user = await fetchAuthUserData(jwt_payload.user_id);
  if (!db_user) return null;

  const membershipWorkspaceIds = db_user.memberships.map((m) => m.workspace_id);
  const roleByWorkspace = new Map<string, string | null>(
    db_user.memberships.map((m) => [m.workspace_id, m.role]),
  );

  // Enforce workspace-scoped access: if token requests a workspace,
  // the user must still be an active member of that workspace.
  if (
    jwt_payload.workspace_id &&
    !membershipWorkspaceIds.includes(jwt_payload.workspace_id)
  ) {
    return null;
  }

  const workspace_id = resolveWorkspaceId(
    jwt_payload.workspace_id || db_user.default_workspace_id,
    membershipWorkspaceIds,
  );
  const workspace_role = normalizeWorkspaceRole(
    workspace_id ? (roleByWorkspace.get(workspace_id) ?? null) : null,
  );

  return {
    user_id: jwt_payload.user_id,
    workspace_id,
    workspaceId: workspace_id,
    workspace_role,
    workspaceRole: workspace_role,
    email: jwt_payload.email || db_user.email,
    system_role: db_user.system_role || jwt_payload.system_role || "user",
  } as const;
}

export const authPlugin = new Elysia({ name: "auth" })
  .derive(async ({ headers, cookie }) => {
    // 1. Check Authorization header
    const authorization = headers.authorization;
    if (authorization) {
      const token = authorization.split(" ")[1];
      if (token) {
        const auth = await getAuth(token);
        if (auth) return { auth };
      }
    }

    // 2. Check explicitly provided cookie from Elysia
    if (cookie && cookie["oewang-session"]?.value) {
      const auth = await getAuth(cookie["oewang-session"].value as string);
      if (auth) return { auth };
    }

    // 3. Manually parse cookie header if needed (fallback)
    const cookieHeader = headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)oewang-session=([^;]*)/);
      if (match && match[1]) {
        const auth = await getAuth(match[1]);
        if (auth) return { auth };
      }
    }

    return { auth: null };
  })
  .as("scoped");

export { generateJwt, verifyJwt };
