import {
  db,
  eq,
  and,
  isNull,
  inArray,
  workspaces,
  user_workspaces,
  workspaceInvitations,
  users,
  pricing,
  workspaceAddons,
} from "@workspace/database";

/**
 * Workspaces repository — ONLY layer with DB access.
 * All reads filter deleted_at: null on workspaces.
 */
export abstract class WorkspacesRepository {
  static async create(
    data: {
      name: string;
      slug: string;
      country?: string | null;
      plan_id?: string | null;
      plan_status?: string;
    },
    tx: any = db,
  ) {
    const [workspace] = await tx.insert(workspaces).values(data).returning();
    return workspace ?? null;
  }

  static async findById(workspace_id: string) {
    const [result] = await db
      .select({
        workspace: workspaces,
        plan: pricing,
      })
      .from(workspaces)
      .leftJoin(pricing, eq(workspaces.plan_id, pricing.id))
      .where(and(eq(workspaces.id, workspace_id), isNull(workspaces.deleted_at)))
      .limit(1);

    if (!result) return null;

    // Fetch active recurring add-ons with their quotas
    const activeAddons = await db
      .select({
        row_id: workspaceAddons.id,
        id: pricing.id,
        addon_type: pricing.addon_type,
        max_ai_tokens: pricing.max_ai_tokens,
        max_vault_size_mb: pricing.max_vault_size_mb,
        amount: workspaceAddons.amount,
        qty: workspaceAddons.qty,
        status: workspaceAddons.status,
        created_at: workspaceAddons.created_at,
      })
      .from(workspaceAddons)
      .innerJoin(pricing, eq(workspaceAddons.addon_id, pricing.id))
      .where(
        and(
          eq(workspaceAddons.workspace_id, workspace_id),
          inArray(workspaceAddons.status, ["active", "cancelled"]),
          isNull(workspaceAddons.deleted_at),
        ),
      );

    // Sum up extra quotas from active recurring add-ons (qty-aware)
    const recurringExtraAi = activeAddons
      .filter((a) => a.addon_type === "ai")
      .reduce((sum, a) => sum + (a.max_ai_tokens || 0) * (a.qty || 1), 0);

    const recurringExtraVault = activeAddons
      .filter((a) => a.addon_type === "vault")
      .reduce((sum, a) => sum + (a.max_vault_size_mb || 0) * (a.qty || 1), 0);

    return {
      ...result.workspace,
      plan: result.plan,
      // Total extra tokens = one-time (from workspace columns) + recurring (from workspace_addons)
      extra_ai_tokens: (result.workspace.extra_ai_tokens || 0) + recurringExtraAi,
      extra_vault_size_mb: (result.workspace.extra_vault_size_mb || 0) + recurringExtraVault,
      active_addons: activeAddons,
    };
  }

  static async addMember(
    data: {
      workspace_id: string;
      user_id: string;
      role: string;
    },
    tx: any = db,
  ) {
    await tx.insert(user_workspaces).values(data);
  }

  static async getMemberWorkspaces(user_id: string) {
    return db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        role: user_workspaces.role,
      })
      .from(user_workspaces)
      .innerJoin(workspaces, eq(user_workspaces.workspace_id, workspaces.id))
      .where(
        and(
          eq(user_workspaces.user_id, user_id),
          isNull(user_workspaces.deleted_at),
          isNull(workspaces.deleted_at),
        ),
      );
  }

  static async getWorkspacesWithPlans(user_id: string) {
    return db
      .select({
        workspace: workspaces,
        plan: pricing,
        role: user_workspaces.role,
      })
      .from(user_workspaces)
      .innerJoin(workspaces, eq(user_workspaces.workspace_id, workspaces.id))
      .leftJoin(pricing, eq(workspaces.plan_id, pricing.id))
      .where(
        and(
          eq(user_workspaces.user_id, user_id),
          isNull(user_workspaces.deleted_at),
          isNull(workspaces.deleted_at),
        ),
      );
  }

  static async getMembers(workspace_id: string) {
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
      .where(
        and(
          eq(user_workspaces.workspace_id, workspace_id),
          isNull(user_workspaces.deleted_at),
        ),
      );
  }

  static async getMembership(user_id: string, workspace_id: string) {
    const [membership] = await db
      .select()
      .from(user_workspaces)
      .where(
        and(
          eq(user_workspaces.user_id, user_id),
          eq(user_workspaces.workspace_id, workspace_id),
          isNull(user_workspaces.deleted_at),
        ),
      )
      .limit(1);
    return membership ?? null;
  }

  static async createInvitation(data: {
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
  }

  static async findInvitationByToken(token: string) {
    const [invitation] = await db
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.token, token),
          eq(workspaceInvitations.status, "pending"),
          isNull(workspaceInvitations.deletedAt),
        ),
      )
      .limit(1);
    return invitation ?? null;
  }

  static async findPendingInvitation(workspaceId: string, email: string) {
    const [invitation] = await db
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.email, email),
          eq(workspaceInvitations.status, "pending"),
          isNull(workspaceInvitations.deletedAt),
        ),
      )
      .limit(1);
    return invitation ?? null;
  }

  static async findPendingInvitationsByEmail(email: string) {
    return db
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.email, email),
          eq(workspaceInvitations.status, "pending"),
          isNull(workspaceInvitations.deletedAt),
        ),
      );
  }

  static async updateInvitationStatus(id: string, status: "accepted" | "expired") {
    await db
      .update(workspaceInvitations)
      .set({
        status,
        acceptedAt: status === "accepted" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workspaceInvitations.id, id),
          isNull(workspaceInvitations.deletedAt),
        ),
      );
  }

  static async getWorkspaceInvitations(workspaceId: string) {
    return db
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.status, "pending"),
          isNull(workspaceInvitations.deletedAt),
        ),
      );
  }

  static async deleteInvitation(id: string) {
    await db
      .update(workspaceInvitations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(workspaceInvitations.id, id));
  }
}
