import { db, users, workspaces, pricing } from "@workspace/database";
import { isNull } from "drizzle-orm";
import {
  ilike,
  or,
  eq,
  desc,
  asc,
  and,
  not,
  sql,
  inArray,
  gte,
  lte,
  type SQL,
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

    return updated;
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
}
