import {
  db,
  eq,
  and,
  desc,
  isNull,
  categories,
  sql,
  inArray,
} from "@workspace/database";
import type { Category } from "@workspace/types";

export abstract class CategoriesRepository {
  static async create(data: {
    workspaceId: string;
    name: string;
    type: "income" | "expense";
  }): Promise<Category | null> {
    const [category] = await db.insert(categories).values(data).returning();
    return category
      ? ({
          ...category,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt,
          deletedAt: category.deletedAt,
        } as unknown as Category)
      : null;
  }

  static async createMany(
    data: {
      workspaceId: string;
      name: string;
      type: "income" | "expense";
    }[],
    tx: any = db,
  ): Promise<Category[]> {
    if (data.length === 0) return [];
    const results = await tx.insert(categories).values(data).returning();
    return results.map((c: any) => ({
      ...c,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      deletedAt: c.deletedAt,
    })) as unknown as Category[];
  }

  static async update(
    id: string,
    workspaceId: string,
    data: Partial<{ name: string }>,
  ): Promise<Category | null> {
    const [category] = await db
      .update(categories)
      .set({ ...data, updatedAt: sql`now()` })
      .where(
        and(
          eq(categories.id, id),
          eq(categories.workspaceId, workspaceId),
          isNull(categories.deletedAt),
        ),
      )
      .returning();
    return category
      ? ({
          ...category,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt,
          deletedAt: category.deletedAt,
        } as unknown as Category)
      : null;
  }

  static async reorder(
    workspaceId: string,
    updates: { id: string; sortOrder: number }[],
  ) {
    if (updates.length === 0) return;

    const sqlChunks = [sql`(CASE`];
    const ids: string[] = [];

    for (const update of updates) {
      sqlChunks.push(
        sql`WHEN ${categories.id} = ${update.id}::uuid THEN ${update.sortOrder}`,
      );
      ids.push(update.id);
    }

    sqlChunks.push(sql`ELSE ${categories.sortOrder} END)::integer`);

    const finalSql = sql.join(sqlChunks, sql` `);

    await db
      .update(categories)
      .set({ sortOrder: finalSql, updatedAt: sql`now()` })
      .where(
        and(
          inArray(categories.id, ids),
          eq(categories.workspaceId, workspaceId),
          isNull(categories.deletedAt),
        ),
      );
  }

  static async delete(
    id: string,
    workspaceId: string,
  ): Promise<Category | null> {
    const [category] = await db
      .update(categories)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(categories.id, id),
          eq(categories.workspaceId, workspaceId),
          isNull(categories.deletedAt),
        ),
      )
      .returning();
    return category
      ? ({
          ...category,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt,
          deletedAt: category.deletedAt,
        } as unknown as Category)
      : null;
  }

  static async findMany(
    workspaceId: string,
    type?: "income" | "expense",
  ): Promise<Category[]> {
    const conditions = [
      eq(categories.workspaceId, workspaceId),
      isNull(categories.deletedAt),
    ];

    if (type) {
      conditions.push(eq(categories.type, type));
    }

    const results = await db
      .select()
      .from(categories)
      .where(and(...conditions))
      // Order by sortOrder ASC, then createdAt DESC as secondary
      .orderBy(categories.sortOrder, desc(categories.createdAt));

    return results.map((c) => ({
      ...c,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      deletedAt: c.deletedAt,
    })) as unknown as Category[];
  }

  static async findById(
    workspaceId: string,
    id: string,
  ): Promise<Category | null> {
    const [category] = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, id),
          eq(categories.workspaceId, workspaceId),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    if (category?.deletedAt) return null;
    return category
      ? ({
          ...category,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt,
          deletedAt: category.deletedAt,
        } as unknown as Category)
      : null;
  }
}
