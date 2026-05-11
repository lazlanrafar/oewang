import {
  db,
  eq,
  and,
  desc,
  isNull,
  vaultFiles,
  count,
  sql,
  pricing,
  workspaces,
  ilike,
  workspaceAddons,
  workspaceSettings,
} from "@workspace/database";

export abstract class VaultRepository {
  static async count(workspaceId: string, data?: { search?: string }) {
    const [result] = await db
      .select({ value: count() })
      .from(vaultFiles)
      .where(
        and(
          eq(vaultFiles.workspaceId, workspaceId),
          isNull(vaultFiles.deletedAt),
          isNull(vaultFiles.inactive_at),
          ...(data?.search
            ? [ilike(vaultFiles.name, `%${data.search}%`)]
            : []),
        ),
      );
    return result?.value ?? 0;
  }

  static async create(data: {
    workspaceId: string;
    name: string;
    key: string;
    size: number;
    type: string;
    metadata?: any;
  }) {
    const [file] = await db
      .insert(vaultFiles)
      .values({
        ...data,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      })
      .returning();
    return file ?? null;
  }

  static async findExistingByFingerprint(
    workspaceId: string,
    fingerprint: { sha256: string; size: number; type: string },
  ) {
    const [file] = await db
      .select()
      .from(vaultFiles)
      .where(
        and(
          eq(vaultFiles.workspaceId, workspaceId),
          eq(vaultFiles.size, fingerprint.size),
          eq(vaultFiles.type, fingerprint.type),
          isNull(vaultFiles.deletedAt),
          sql`(${vaultFiles.metadata})::jsonb ->> 'sha256' = ${fingerprint.sha256}`,
        ),
      )
      .orderBy(desc(vaultFiles.createdAt))
      .limit(1);

    return file ?? null;
  }

  static async delete(id: string, workspaceId: string) {
    const [file] = await db
      .update(vaultFiles)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(vaultFiles.id, id), eq(vaultFiles.workspaceId, workspaceId)),
      )
      .returning();
    return file ?? null;
  }

  static async findMany(
    workspaceId: string,
    limit: number = 20,
    offset: number = 0,
    search?: string,
  ) {
    return db
      .select()
      .from(vaultFiles)
      .where(
        and(
          eq(vaultFiles.workspaceId, workspaceId),
          isNull(vaultFiles.deletedAt),
          isNull(vaultFiles.inactive_at),
          ...(search ? [ilike(vaultFiles.name, `%${search}%`)] : []),
        ),
      )
      .orderBy(desc(vaultFiles.createdAt))
      .limit(limit)
      .offset(offset);
  }

  static async findById(id: string, workspaceId: string) {
    const [file] = await db
      .select()
      .from(vaultFiles)
      .where(
        and(
          eq(vaultFiles.id, id),
          eq(vaultFiles.workspaceId, workspaceId),
          isNull(vaultFiles.deletedAt),
        ),
      )
      .limit(1);
    return file ?? null;
  }

  static async updateTags(id: string, workspaceId: string, tags: string[]) {
    const [file] = await db
      .update(vaultFiles)
      .set({ tags, updatedAt: new Date() })
      .where(
        and(eq(vaultFiles.id, id), eq(vaultFiles.workspaceId, workspaceId)),
      )
      .returning();
    return file ?? null;
  }

  static async getUsageAndQuota(workspaceId: string) {
    const [row] = await db
      .select({
        used: workspaces.vault_size_used_bytes,
        extra: workspaces.extra_vault_size_mb,
        maxMb: pricing.max_vault_size_mb,
        storage_violation_at: workspaces.storage_violation_at,
      })
      .from(workspaces)
      .leftJoin(pricing, eq(workspaces.plan_id, pricing.id))
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!row) return null;

    // Sum up recurring Vault addons
    const activeAddons = await db
      .select({
        maxMb: pricing.max_vault_size_mb,
      })
      .from(workspaceAddons)
      .innerJoin(pricing, eq(workspaceAddons.addon_id, pricing.id))
      .where(
        and(
          eq(workspaceAddons.workspace_id, workspaceId),
          eq(workspaceAddons.status, "active"),
          eq(pricing.addon_type, "vault"),
          isNull(workspaceAddons.deleted_at),
        ),
      );

    const recurringExtraVault = activeAddons.reduce(
      (sum, a) => sum + (a.maxMb || 0),
      0,
    );

    return {
      used: row.used,
      maxMb: (row.maxMb || 0) + row.extra + recurringExtraVault,
      storage_violation_at: row.storage_violation_at,
    };
  }

  static async updateVaultSize(workspaceId: string, newSize: number) {
    await db
      .update(workspaces)
      .set({ vault_size_used_bytes: newSize })
      .where(eq(workspaces.id, workspaceId));
  }

  static async incrementVaultSize(workspaceId: string, deltaBytes: number) {
    await db
      .update(workspaces)
      .set({
        vault_size_used_bytes: sql`GREATEST(0, ${workspaces.vault_size_used_bytes} + ${deltaBytes})`,
      })
      .where(eq(workspaces.id, workspaceId));
  }

  static async updateWorkspaceSubscription(workspaceId: string, data: any) {
    await db
      .update(workspaces)
      .set(data)
      .where(eq(workspaces.id, workspaceId));
  }

  static async getWorkspaceSettings(workspaceId: string) {
    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(
        and(
          eq(workspaceSettings.workspaceId, workspaceId),
          isNull(workspaceSettings.deletedAt),
        ),
      )
      .limit(1);
    return settings ?? null;
  }

  static async bulkSetFilesInactive(workspaceId: string, isInactive: boolean) {
    await db
      .update(vaultFiles)
      .set({ inactive_at: isInactive ? new Date() : null })
      .where(
        and(
          eq(vaultFiles.workspaceId, workspaceId),
          isNull(vaultFiles.deletedAt),
        ),
      );
  }

  static async findAllWorkspacesWithUsage() {
    const ws = await db
      .select({
        id: workspaces.id,
        vault_size_used_bytes: workspaces.vault_size_used_bytes,
        extra_vault_size_mb: workspaces.extra_vault_size_mb,
        storage_violation_at: workspaces.storage_violation_at,
      })
      .from(workspaces)
      .where(isNull(workspaces.deleted_at));

    const results = [];

    for (const w of ws) {
      const quota = await this.getUsageAndQuota(w.id);
      if (quota) {
        results.push({
          workspaceId: w.id,
          used: Number(w.vault_size_used_bytes),
          maxMb: quota.maxMb,
          storage_violation_at: w.storage_violation_at,
        });
      }
    }

    return results;
  }

  static async countActiveReferencesByKey(workspaceId: string, key: string) {
    const [result] = await db
      .select({ value: count() })
      .from(vaultFiles)
      .where(
        and(
          eq(vaultFiles.workspaceId, workspaceId),
          eq(vaultFiles.key, key),
          isNull(vaultFiles.deletedAt),
        ),
      );

    return result?.value ?? 0;
  }
}
