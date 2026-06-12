import {
  db,
  pricing,
  user_workspaces,
  users,
  workspaces,
} from "@workspace/database";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

export abstract class SystemAdminsRepository {
  static async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    system_role?: string;
    start?: string;
    end?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const conditions: SQL[] = [];

    if (params.search) {
      conditions.push(
        or(
          ilike(users.name, `%${params.search}%`),
          ilike(users.email, `%${params.search}%`),
        )!,
      );
    }

    if (params.system_role) {
      const roles = params.system_role.split(
        ",",
      ) as import("@workspace/constants").SystemRole[];
      conditions.push(inArray(users.system_role, roles));
    }

    if (params.start) {
      conditions.push(gte(users.created_at, new Date(params.start)));
    }

    if (params.end) {
      conditions.push(lte(users.created_at, new Date(params.end)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Default sort: Role hierarchy (owner > finance > user), then alphabetically
    const roleSort = sql`CASE WHEN ${users.system_role} = 'owner' THEN 1 WHEN ${users.system_role} = 'finance' THEN 2 ELSE 3 END`;
    let orderByParams: any[] = [asc(roleSort), asc(users.name)];

    if (params.sortBy) {
      const col = (users as any)[params.sortBy];
      if (col) {
        orderByParams = params.sortOrder === "asc" ? [asc(col)] : [desc(col)];
      }
    }

    const query = db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        profile_picture: users.profile_picture,
        system_role: users.system_role,
        created_at: users.created_at,
      })
      .from(users)
      .where(whereClause)
      .orderBy(...orderByParams)
      .limit(params.limit)
      .offset((params.page - 1) * params.limit);

    const rows = await query;

    const countQuery = await db
      .select({ count: sql`count(*)` })
      .from(users)
      .where(whereClause);
    const totalResult = Number(countQuery[0]?.count || 0);

    return { rows, total: totalResult };
  }

  /**
   * List all workspaces with pagination and search
   */
  static async findAllWorkspaces(params: {
    page: number;
    limit: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const conditions: (SQL | undefined)[] = [isNull(workspaces.deleted_at)];

    if (params.search) {
      conditions.push(
        or(
          ilike(workspaces.name, `%${params.search}%`),
          ilike(workspaces.slug, `%${params.search}%`),
        ),
      );
    }

    const whereClause = and(...conditions);
    let orderByParams: any[] = [desc(workspaces.created_at)];

    if (params.sortBy) {
      const col = (workspaces as any)[params.sortBy];
      if (col) {
        orderByParams = params.sortOrder === "asc" ? [asc(col)] : [desc(col)];
      }
    }

    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        plan_id: workspaces.plan_id,
        plan_status: workspaces.plan_status,
        plan_name: pricing.name,
        created_at: workspaces.created_at,
        ai_tokens_used: workspaces.ai_tokens_used,
        vault_size_used_bytes: workspaces.vault_size_used_bytes,
      })
      .from(workspaces)
      .leftJoin(pricing, eq(workspaces.plan_id, pricing.id))
      .where(whereClause)
      .orderBy(...orderByParams)
      .limit(params.limit)
      .offset((params.page - 1) * params.limit);

    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(workspaces)
      .where(whereClause);
    const total = Number(countResult[0]?.count || 0);

    return { rows, total };
  }

  /**
   * Fetch the workspace owner (or fallback to any active member) for notifications.
   */
  static async findWorkspaceOwnerWithMeta(workspaceId: string) {
    const [ownerRow] = await db
      .select({
        email: users.email,
        name: users.name,
        workspace_name: workspaces.name,
      })
      .from(user_workspaces)
      .innerJoin(users, eq(user_workspaces.user_id, users.id))
      .innerJoin(workspaces, eq(user_workspaces.workspace_id, workspaces.id))
      .where(
        and(
          eq(user_workspaces.workspace_id, workspaceId),
          eq(user_workspaces.role, "owner"),
          isNull(user_workspaces.deleted_at),
        ),
      )
      .limit(1);

    if (ownerRow) return ownerRow;

    // Fallback: any active member (e.g. admin), so notifications still go out.
    const [memberRow] = await db
      .select({
        email: users.email,
        name: users.name,
        workspace_name: workspaces.name,
      })
      .from(user_workspaces)
      .innerJoin(users, eq(user_workspaces.user_id, users.id))
      .innerJoin(workspaces, eq(user_workspaces.workspace_id, workspaces.id))
      .where(
        and(
          eq(user_workspaces.workspace_id, workspaceId),
          isNull(user_workspaces.deleted_at),
        ),
      )
      .limit(1);

    return memberRow ?? null;
  }

  /**
   * Update a workspace's pricing plan
   */
  static async updateWorkspacePlan(workspaceId: string, planId: string) {
    // Also fetch the plan to set plan_status properly (e.g., active)
    const [plan] = await db
      .select()
      .from(pricing)
      .where(eq(pricing.id, planId))
      .limit(1);

    if (!plan) throw new Error("Plan not found");

    const [updated] = await db
      .update(workspaces)
      .set({
        plan_id: planId,
        plan_status: "active", // Manually activated by admin
        updated_at: new Date(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    return { workspace: updated, plan };
  }

  /**
   * List all available plans
   */
  static async findAllPlans() {
    return db
      .select({
        id: pricing.id,
        name: pricing.name,
        is_active: pricing.is_active,
      })
      .from(pricing)
      .where(and(eq(pricing.is_addon, false), isNull(pricing.deleted_at)))
      .orderBy(asc(pricing.name));
  }

  static async getUserStats(params: { start?: string; end?: string }) {
    const conditions: SQL[] = [];
    if (params.start) {
      conditions.push(gte(users.created_at, new Date(params.start)));
    }
    if (params.end) {
      conditions.push(lte(users.created_at, new Date(params.end)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
        owners: sql<number>`count(*) filter (where ${users.system_role} in ('superadmin', 'owner'))`,
        finance: sql<number>`count(*) filter (where ${users.system_role} = 'finance')`,
        users: sql<number>`count(*) filter (where ${users.system_role} = 'user')`,
      })
      .from(users)
      .where(whereClause);

    return {
      total: Number(row?.total ?? 0),
      owners: Number(row?.owners ?? 0),
      finance: Number(row?.finance ?? 0),
      users: Number(row?.users ?? 0),
    };
  }

  static async getWorkspaceStats() {
    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${workspaces.plan_status} = 'active')`,
        paid: sql<number>`count(*) filter (where ${workspaces.plan_id} is not null and ${pricing.name} is not null and lower(${pricing.name}) <> 'free')`,
        free: sql<number>`count(*) filter (where ${workspaces.plan_id} is null or lower(coalesce(${pricing.name}, 'free')) = 'free')`,
      })
      .from(workspaces)
      .leftJoin(pricing, eq(workspaces.plan_id, pricing.id))
      .where(isNull(workspaces.deleted_at));

    return {
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      paid: Number(row?.paid ?? 0),
      free: Number(row?.free ?? 0),
    };
  }

  static async findUserEmail(userId: string) {
    const [dbUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return dbUser ?? null;
  }

  static async updateSystemRole(
    userId: string,
    systemRole: import("@workspace/constants").SystemRole,
  ) {
    await db
      .update(users)
      .set({ system_role: systemRole })
      .where(eq(users.id, userId));
  }
}
