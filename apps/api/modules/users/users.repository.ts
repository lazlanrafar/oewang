import {
  db,
  eq,
  and,
  isNull,
  users,
  user_workspaces,
  workspaces,
  pricing,
} from "@workspace/database";

/**
 * Users repository — ONLY layer with DB access.
 * All reads filter by workspace_id + deleted_at: null where applicable.
 */
export abstract class UsersRepository {
  static async findById(user_id: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, user_id))
      .limit(1);
    return user ?? null;
  }

  static async findByEmail(email: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user ?? null;
  }

  static async upsert(data: {
    id: string;
    email: string;
    name?: string | null;
    oauth_provider?: string | null;
    profile_picture?: string | null;
    providers?: string[] | null;
  }) {
    await db
      .insert(users)
      .values({
        id: data.id,
        email: data.email,
        name: data.name,
        oauth_provider: data.oauth_provider,
        profile_picture: data.profile_picture,
        providers: data.providers ?? null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: data.email,
          name: data.name,
          profile_picture: data.profile_picture,
          providers: data.providers ?? null,
          updated_at: new Date(),
        },
      });
  }

  static async update(user_id: string, data: Partial<typeof users.$inferInsert>) {
    await db
      .update(users)
      .set({ ...data, updated_at: new Date() })
      .where(eq(users.id, user_id));
  }

  static async getWorkspaceId(user_id: string, tx: any = db) {
    const [user] = await tx
      .select({ workspace_id: users.workspace_id })
      .from(users)
      .where(eq(users.id, user_id))
      .limit(1);
    return user?.workspace_id ?? null;
  }

  static async setWorkspaceId(user_id: string, workspace_id: string, tx: any = db) {
    await tx
      .update(users)
      .set({ workspace_id, updated_at: new Date() })
      .where(eq(users.id, user_id));
  }

  static async getMemberships(user_id: string) {
    return db
      .select()
      .from(user_workspaces)
      .where(
        and(
          eq(user_workspaces.user_id, user_id),
          isNull(user_workspaces.deleted_at),
        ),
      );
  }

  static async getWorkspacesWithRole(user_id: string) {
    return db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        role: user_workspaces.role,
        plan_name: pricing.name,
        max_workspaces: pricing.max_workspaces,
        ai_tokens_used: workspaces.ai_tokens_used,
        vault_size_used_bytes: workspaces.vault_size_used_bytes,
        max_ai_tokens: pricing.max_ai_tokens,
        max_vault_size_mb: pricing.max_vault_size_mb,
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
}
