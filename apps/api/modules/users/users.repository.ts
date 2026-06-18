import {
  and,
  db,
  eq,
  isNull,
  oauth_accounts,
  pricing,
  user_workspaces,
  users,
  workspaces,
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
    id?: string;
    email: string;
    name?: string | null;
    oauth_provider?: string | null;
    profile_picture?: string | null;
    providers?: string[] | null;
    password_hash?: string | null;
  }) {
    const values: typeof users.$inferInsert = {
      email: data.email,
      name: data.name,
      oauth_provider: data.oauth_provider,
      profile_picture: data.profile_picture,
      providers: data.providers ?? null,
      password_hash: data.password_hash ?? null,
    };
    if (data.id) values.id = data.id;

    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: data.id ? users.id : users.email,
        set: {
          name: data.name,
          profile_picture: data.profile_picture,
          providers: data.providers ?? null,
          updated_at: new Date(),
        },
      });
  }

  static async update(
    user_id: string,
    data: Partial<typeof users.$inferInsert>,
  ) {
    await db
      .update(users)
      .set({ ...data, updated_at: new Date() })
      .where(eq(users.id, user_id));
  }

  static async findOAuthAccount(provider: string, provider_user_id: string) {
    const [row] = await db
      .select()
      .from(oauth_accounts)
      .where(
        and(
          eq(oauth_accounts.provider, provider),
          eq(oauth_accounts.provider_user_id, provider_user_id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  static async upsertOAuthAccount(data: {
    user_id: string;
    provider: string;
    provider_user_id: string;
    provider_email?: string | null;
    provider_name?: string | null;
    provider_avatar?: string | null;
  }) {
    await db
      .insert(oauth_accounts)
      .values(data)
      .onConflictDoUpdate({
        target: [oauth_accounts.provider, oauth_accounts.provider_user_id],
        set: {
          user_id: data.user_id,
          provider_email: data.provider_email,
          provider_name: data.provider_name,
          provider_avatar: data.provider_avatar,
          updated_at: new Date(),
        },
      });
  }

  static async getOAuthAccounts(user_id: string) {
    return db
      .select()
      .from(oauth_accounts)
      .where(eq(oauth_accounts.user_id, user_id));
  }

  static async deleteOAuthAccount(user_id: string, provider: string) {
    await db
      .delete(oauth_accounts)
      .where(
        and(
          eq(oauth_accounts.user_id, user_id),
          eq(oauth_accounts.provider, provider),
        ),
      );
  }

  static async getWorkspaceId(user_id: string, tx: any = db) {
    const [user] = await tx
      .select({ workspace_id: users.workspace_id })
      .from(users)
      .where(eq(users.id, user_id))
      .limit(1);
    return user?.workspace_id ?? null;
  }

  static async setWorkspaceId(
    user_id: string,
    workspace_id: string,
    tx: any = db,
  ) {
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

  /**
   * Workspace ids the user is an *active* member of (membership and workspace
   * both not soft-deleted). Mirrors the auth plugin so issued JWTs never carry
   * a workspace the guard would later reject.
   */
  static async getActiveWorkspaceIds(user_id: string): Promise<string[]> {
    const rows = await db
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
    return rows.map((r) => r.workspace_id);
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
