import {
  and,
  audit_logs,
  db,
  desc,
  eq,
  isNull,
  users,
} from "@workspace/database";

/**
 * Audit logs repository — append-only.
 * Never update or delete audit logs.
 */
export abstract class AuditLogsRepository {
  static async create(data: {
    workspace_id: string;
    user_id: string;
    action: string;
    entity: string;
    entity_id: string;
    before?: unknown;
    after?: unknown;
  }) {
    await db.insert(audit_logs).values({
      workspace_id: data.workspace_id,
      user_id: data.user_id,
      action: data.action,
      entity: data.entity,
      entity_id: data.entity_id,
      before: data.before ?? null,
      after: data.after ?? null,
    });
  }

  static async createMany(
    data: {
      workspace_id: string;
      user_id: string;
      action: string;
      entity: string;
      entity_id: string;
      before?: unknown;
      after?: unknown;
    }[],
    tx: any = db,
  ) {
    if (data.length === 0) return;

    // Batch inserts for safety or just pass the whole array depending on data size
    // For thousands of rows Drizzle handles it well, but let's just insert all inside values
    await tx.insert(audit_logs).values(
      data.map((d) => ({
        workspace_id: d.workspace_id,
        user_id: d.user_id,
        action: d.action,
        entity: d.entity,
        entity_id: d.entity_id,
        before: d.before ?? null,
        after: d.after ?? null,
      })),
    );
  }

  static async findByEntity(
    entity: string,
    entity_id: string,
    workspace_id: string,
  ) {
    return db
      .select({
        id: audit_logs.id,
        action: audit_logs.action,
        entity: audit_logs.entity,
        entity_id: audit_logs.entity_id,
        before: audit_logs.before,
        after: audit_logs.after,
        created_at: audit_logs.created_at,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(audit_logs)
      .leftJoin(users, eq(audit_logs.user_id, users.id))
      .where(
        and(
          eq(audit_logs.entity, entity),
          eq(audit_logs.entity_id, entity_id),
          eq(audit_logs.workspace_id, workspace_id),
          isNull(audit_logs.deleted_at),
        ),
      )
      .orderBy(desc(audit_logs.created_at));
  }
}
