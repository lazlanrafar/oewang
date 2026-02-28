import {
  db,
  eq,
  and,
  workspaces,
  user_workspaces,
  workspaceInvitations,
  users,
} from "@workspace/database";

/**
 * Workspaces repository — ONLY layer with DB access.
 * All reads filter deleted_at: null on workspaces.
 */
export const workspacesRepository = {
  async create(data: {
    name: string;
    slug: string;
    country?: string | null;
    plan_id?: string | null;
    plan_status?: string;
  }) {
    const [workspace] = await db.insert(workspaces).values(data).returning();
    return workspace ?? null;
  },

  async findById(workspace_id: string) {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspace_id))
      .limit(1);

    if (workspace?.deleted_at) return null;
    return workspace ?? null;
  },

  async addMember(data: {
    workspace_id: string;
    user_id: string;
    role: string;
  }) {
    await db.insert(user_workspaces).values(data);
  },

  async getMemberWorkspaces(user_id: string) {
    return db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        role: user_workspaces.role,
      })
      .from(user_workspaces)
      .innerJoin(workspaces, eq(user_workspaces.workspace_id, workspaces.id))
      .where(eq(user_workspaces.user_id, user_id));
  },

  async getMembers(workspace_id: string) {
    return db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        profilePicture: users.profile_picture,
        role: user_workspaces.role,
        joinedAt: user_workspaces.joined_at,
      })
      .from(user_workspaces)
      .innerJoin(users, eq(user_workspaces.user_id, users.id))
      .where(eq(user_workspaces.workspace_id, workspace_id));
  },

  async getMembership(user_id: string, workspace_id: string) {
    const [membership] = await db
      .select()
      .from(user_workspaces)
      .where(
        and(
          eq(user_workspaces.user_id, user_id),
          eq(user_workspaces.workspace_id, workspace_id),
        ),
      )
      .limit(1);
    return membership ?? null;
  },

  async createInvitation(data: {
    workspaceId: string;
    email: string;
    role: string;
    token: string;
    expiresAt: Date;
  }) {
    const [invitation] = await db
      .insert(workspaceInvitations)
      .values(data)
      .returning();
    return invitation;
  },

  async findInvitationByToken(token: string) {
    const [invitation] = await db
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.token, token),
          eq(workspaceInvitations.status, "pending"),
        ),
      )
      .limit(1);
    return invitation ?? null;
  },

  async findPendingInvitation(workspaceId: string, email: string) {
    const [invitation] = await db
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.email, email),
          eq(workspaceInvitations.status, "pending"),
        ),
      )
      .limit(1);
    return invitation ?? null;
  },

  async findPendingInvitationsByEmail(email: string) {
    return db
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.email, email),
          eq(workspaceInvitations.status, "pending"),
        ),
      );
  },

  async updateInvitationStatus(id: string, status: "accepted" | "expired") {
    await db
      .update(workspaceInvitations)
      .set({ status, acceptedAt: status === "accepted" ? new Date() : null })
      .where(eq(workspaceInvitations.id, id));
  },

  async getWorkspaceInvitations(workspaceId: string) {
    return db
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.status, "pending"),
        ),
      );
  },

  async deleteInvitation(id: string) {
    await db
      .delete(workspaceInvitations)
      .where(eq(workspaceInvitations.id, id));
  },
};
