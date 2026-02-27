import { db, users } from "@workspace/database";
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
  type SQL,
} from "drizzle-orm";

export abstract class SystemAdminsRepository {
  static async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    system_role?: string;
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
}
