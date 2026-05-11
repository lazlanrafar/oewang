import { Elysia } from "elysia";
import { createClient } from "@workspace/supabase/admin";
import { db, eq, and, isNull } from "@workspace/database";
import { users, user_workspaces, workspaces } from "@workspace/database";
import * as jose from "jose";
import { Env } from "@workspace/constants";
import { normalizeWorkspaceRole } from "../modules/workspaces/workspace-permissions";

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

async function getActiveMembershipWorkspaceIds(user_id: string) {
  const memberships = await db
    .select({ workspace_id: user_workspaces.workspace_id })
    .from(user_workspaces)
    .innerJoin(workspaces, eq(user_workspaces.workspace_id, workspaces.id))
    .where(
      and(
        eq(user_workspaces.user_id, user_id),
        isNull(user_workspaces.deleted_at),
        isNull(workspaces.deleted_at),
      ),
    );

  return memberships.map((m) => m.workspace_id);
}

async function getMembershipRole(user_id: string, workspace_id: string) {
  if (!workspace_id) {
    return normalizeWorkspaceRole(null);
  }

  const [membership] = await db
    .select({ role: user_workspaces.role })
    .from(user_workspaces)
    .where(
      and(
        eq(user_workspaces.user_id, user_id),
        eq(user_workspaces.workspace_id, workspace_id),
        isNull(user_workspaces.deleted_at),
      ),
    )
    .limit(1);

  return normalizeWorkspaceRole(membership?.role);
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
 *
 * Hybrid approach:
 * 1. Try to verify as app JWT first (has user_id + workspace_id)
 * 2. If that fails, try Supabase token exchange (for initial login flow)
 */
export async function getAuth(token: string) {
  // Try app JWT first
  const jwt_payload = await verifyJwt(token);
  if (jwt_payload) {
    const [db_user] = await db
      .select({
        email: users.email,
        workspace_id: users.workspace_id,
        system_role: users.system_role,
      })
      .from(users)
      .where(eq(users.id, jwt_payload.user_id))
      .limit(1);

    if (!db_user) return null;

    const membershipWorkspaceIds = await getActiveMembershipWorkspaceIds(
      jwt_payload.user_id,
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
      jwt_payload.workspace_id || db_user.workspace_id,
      membershipWorkspaceIds,
    );
    const workspace_role = await getMembershipRole(
      jwt_payload.user_id,
      workspace_id,
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

  // Fallback: try Supabase token
  try {
    const supabase = createClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    const membershipWorkspaceIds = await getActiveMembershipWorkspaceIds(user.id);

    // Look up user record for workspace_id and system role
    const [db_user] = await db
      .select({
        email: users.email,
        workspace_id: users.workspace_id,
        system_role: users.system_role,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const workspace_id = resolveWorkspaceId(
      db_user?.workspace_id,
      membershipWorkspaceIds,
    );
    const workspace_role = await getMembershipRole(user.id, workspace_id);

    return {
      user_id: user.id,
      workspace_id,
      workspaceId: workspace_id,
      workspace_role,
      workspaceRole: workspace_role,
      email: db_user?.email || user.email || "",
      system_role: db_user?.system_role || user.app_metadata?.system_role || "user",
    } as const;
  } catch {
    return null;
  }
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
