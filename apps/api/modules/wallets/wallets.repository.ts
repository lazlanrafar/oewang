import {
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  isNull,
  like,
  sql,
  wallets,
} from "@workspace/database";

export abstract class WalletsRepository {
  static async create(data: {
    workspaceId: string;
    groupId?: string | null;
    name: string;
    balance: number;
    isIncludedInTotals?: boolean;
    isDefault?: boolean;
  }) {
    const [wallet] = await db
      .insert(wallets)
      .values({
        ...data,
        balance: data.balance.toString(),
      })
      .returning();
    return wallet ?? null;
  }

  static async createMany(
    data: {
      workspaceId: string;
      groupId?: string | null;
      name: string;
      balance: number;
      isIncludedInTotals?: boolean;
    }[],
    tx: any = db,
  ) {
    return tx
      .insert(wallets)
      .values(
        data.map((w) => ({
          ...w,
          balance: w.balance.toString(),
        })),
      )
      .returning();
  }

  static async update(
    id: string,
    workspaceId: string,
    data: Partial<{
      name: string;
      groupId: string | null;
      balance: number;
      isIncludedInTotals: boolean;
      isDefault: boolean;
      sortOrder: number;
    }>,
  ) {
    const updateData: any = { ...data, updatedAt: new Date().toISOString() };
    if (data.balance !== undefined) {
      updateData.balance = data.balance.toString();
    }

    const [wallet] = await db
      .update(wallets)
      .set(updateData)
      .where(
        and(
          eq(wallets.id, id),
          eq(wallets.workspaceId, workspaceId),
          isNull(wallets.deletedAt),
        ),
      )
      .returning();
    return wallet ?? null;
  }

  static async delete(id: string, workspaceId: string) {
    const [wallet] = await db
      .update(wallets)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(wallets.id, id), eq(wallets.workspaceId, workspaceId)))
      .returning();
    return wallet ?? null;
  }

  static async findMany(
    workspaceId: string,
    filters?: {
      search?: string;
      groupId?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ rows: any[]; total: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(wallets.workspaceId, workspaceId),
      isNull(wallets.deletedAt),
    ];

    if (filters?.search) {
      conditions.push(like(wallets.name, `%${filters.search}%`));
    }

    if (filters?.groupId && filters.groupId !== "") {
      if (filters.groupId === "none") {
        conditions.push(isNull(wallets.groupId));
      } else {
        conditions.push(eq(wallets.groupId, sql`${filters.groupId}::uuid`));
      }
    }

    const rows = await db
      .select()
      .from(wallets)
      .where(and(...conditions))
      .orderBy(asc(wallets.sortOrder), desc(wallets.createdAt))
      .limit(limit)
      .offset(offset);

    const [stats] = await db
      .select({ total: sql<number>`count(*)` })
      .from(wallets)
      .where(and(...conditions));

    return {
      rows: rows.map((wallet) => ({
        ...wallet,
        balance: Number(wallet.balance),
      })),
      total: Number(stats?.total ?? 0),
    };
  }

  static async findById(workspaceId: string, id: string) {
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.id, id),
          eq(wallets.workspaceId, workspaceId),
          isNull(wallets.deletedAt),
        ),
      )
      .limit(1);

    if (wallet?.deletedAt) return null;
    if (!wallet) return null;

    return {
      ...wallet,
      balance: Number(wallet.balance),
    };
  }

  static async reorder(
    workspaceId: string,
    updates: { id: string; sortOrder: number; groupId?: string | null }[],
  ) {
    if (updates.length === 0) return;

    const sqlChunksSort = [sql`(CASE`];
    const sqlChunksGroup = [sql`(CASE`];
    const ids: string[] = [];
    let hasGroupUpdates = false;

    for (const update of updates) {
      sqlChunksSort.push(
        sql`WHEN ${wallets.id} = ${update.id} THEN ${update.sortOrder}`,
      );
      if (update.groupId !== undefined) {
        hasGroupUpdates = true;
        if (update.groupId === null) {
          sqlChunksGroup.push(sql`WHEN ${wallets.id} = ${update.id} THEN NULL`);
        } else {
          sqlChunksGroup.push(
            sql`WHEN ${wallets.id} = ${update.id} THEN ${update.groupId}::uuid`,
          );
        }
      }
      ids.push(update.id);
    }

    sqlChunksSort.push(sql`END)::integer`);
    sqlChunksGroup.push(sql`ELSE ${wallets.groupId} END)`);

    const updateSet: any = {
      sortOrder: sql.join(sqlChunksSort, sql` `),
      updatedAt: new Date().toISOString(),
    };

    if (hasGroupUpdates) {
      updateSet.groupId = sql.join(sqlChunksGroup, sql` `);
    }

    await db
      .update(wallets)
      .set(updateSet)
      .where(
        and(
          inArray(wallets.id, ids),
          eq(wallets.workspaceId, workspaceId),
          isNull(wallets.deletedAt),
        ),
      );
  }

  static async findDefault(workspaceId: string) {
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.workspaceId, workspaceId),
          eq(wallets.isDefault, true),
          isNull(wallets.deletedAt),
        ),
      )
      .limit(1);

    if (!wallet) return null;
    return { ...wallet, balance: Number(wallet.balance) };
  }

  static async setDefault(workspaceId: string, id: string) {
    return db.transaction(async (tx) => {
      await tx
        .update(wallets)
        .set({ isDefault: false, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(wallets.workspaceId, workspaceId),
            eq(wallets.isDefault, true),
            isNull(wallets.deletedAt),
          ),
        );

      const [wallet] = await tx
        .update(wallets)
        .set({ isDefault: true, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(wallets.id, id),
            eq(wallets.workspaceId, workspaceId),
            isNull(wallets.deletedAt),
          ),
        )
        .returning();
      return wallet ?? null;
    });
  }

  static async updateBalance(
    id: string,
    workspaceId: string,
    amount: number,
    tx: any = db,
  ) {
    const [wallet] = await tx
      .update(wallets)
      .set({
        balance: sql`${wallets.balance} + ${amount}`,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(wallets.id, id),
          eq(wallets.workspaceId, workspaceId),
          isNull(wallets.deletedAt),
        ),
      )
      .returning();
    return wallet ?? null;
  }
}
