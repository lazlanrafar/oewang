import {
  type InsertFeedback,
  db,
  feedback,
  users,
} from "@workspace/database";
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { FeedbackListInput, UpdateFeedbackStatusInput } from "./feedback.dto";

export abstract class FeedbackRepository {
  static async create(data: InsertFeedback) {
    const [result] = await db.insert(feedback).values(data).returning();
    return result!;
  }

  static async findAll(
    query: Pick<FeedbackListInput, "search" | "status" | "type" | "source">,
    limit: number,
    offset: number,
  ) {
    const conditions: (SQL<unknown> | undefined)[] = [
      isNull(feedback.deleted_at),
    ];

    if (query.search) {
      conditions.push(
        or(
          ilike(feedback.message, `%${query.search}%`),
          ilike(feedback.email, `%${query.search}%`),
          ilike(feedback.name, `%${query.search}%`),
        ),
      );
    }
    if (query.status) {
      conditions.push(eq(feedback.status, query.status as never));
    }
    if (query.type) {
      conditions.push(eq(feedback.type, query.type as never));
    }
    if (query.source) {
      conditions.push(eq(feedback.source, query.source as never));
    }

    const rows = await db
      .select({ row: feedback, total: sql<number>`count(*) over()` })
      .from(feedback)
      .where(and(...conditions))
      .orderBy(desc(feedback.created_at))
      .limit(limit)
      .offset(offset);

    return {
      rows: rows.map((r) => r.row),
      total: rows.length ? Number(rows[0]?.total ?? 0) : 0,
    };
  }

  static async findById(id: string) {
    const result = await db
      .select()
      .from(feedback)
      .where(and(eq(feedback.id, id), isNull(feedback.deleted_at)))
      .limit(1);

    return result[0] || null;
  }

  static async updateStatus(
    id: string,
    data: UpdateFeedbackStatusInput & {
      reviewed_by: string;
      resolved_at: Date | null;
      updated_at: Date;
    },
  ) {
    const [result] = await db
      .update(feedback)
      .set(data)
      .where(and(eq(feedback.id, id), isNull(feedback.deleted_at)))
      .returning();

    return result;
  }

  static async getStats() {
    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
        new: sql<number>`count(*) filter (where ${feedback.status} = 'new')`,
        in_review: sql<number>`count(*) filter (where ${feedback.status} = 'in_review')`,
        planned: sql<number>`count(*) filter (where ${feedback.status} = 'planned')`,
        resolved: sql<number>`count(*) filter (where ${feedback.status} = 'resolved')`,
        rejected: sql<number>`count(*) filter (where ${feedback.status} = 'rejected')`,
      })
      .from(feedback)
      .where(isNull(feedback.deleted_at));

    return {
      total: Number(row?.total ?? 0),
      new: Number(row?.new ?? 0),
      in_review: Number(row?.in_review ?? 0),
      planned: Number(row?.planned ?? 0),
      resolved: Number(row?.resolved ?? 0),
      rejected: Number(row?.rejected ?? 0),
    };
  }

  // Broadcast target list — every admin user, so a submission can notify all
  // of them. No existing helper does this lookup (it's not a paginated list
  // like the admin-users data table needs).
  static async listAdminUserIds() {
    return db
      .select({ id: users.id, workspace_id: users.workspace_id })
      .from(users)
      .where(inArray(users.system_role, ["superadmin", "owner", "finance"]));
  }
}
