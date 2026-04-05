import {
  db,
  transactionItems,
  categories,
} from "@workspace/database";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

export abstract class TransactionItemsRepository {
  static async bulkCreate(data: (typeof transactionItems.$inferInsert)[]) {
    if (data.length === 0) return [];
    return db.insert(transactionItems).values(data).returning();
  }

  static async findByTransactionId(
    workspaceId: string,
    transactionId: string,
    page: number,
    limit: number,
  ) {
    const filters = [
      eq(transactionItems.workspaceId, workspaceId),
      eq(transactionItems.transactionId, transactionId),
      isNull(transactionItems.deletedAt),
    ];

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactionItems)
      .where(and(...filters));

    const rows = await db
      .select({
        item: transactionItems,
        category: { id: categories.id, name: categories.name },
      })
      .from(transactionItems)
      .leftJoin(categories, eq(transactionItems.categoryId, categories.id))
      .where(and(...filters))
      .orderBy(desc(transactionItems.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const data = rows.map((r) => ({ ...r.item, category: r.category }));

    return { data, total: Number(countResult?.count || 0) };
  }

  static async findById(
    workspaceId: string,
    transactionId: string,
    itemId: string,
  ) {
    const [result] = await db
      .select()
      .from(transactionItems)
      .where(
        and(
          eq(transactionItems.workspaceId, workspaceId),
          eq(transactionItems.transactionId, transactionId),
          eq(transactionItems.id, itemId),
          isNull(transactionItems.deletedAt),
        ),
      );
    return result;
  }

  static async softDelete(
    workspaceId: string,
    transactionId: string,
    itemId: string,
  ) {
    const [result] = await db
      .update(transactionItems)
      .set({ deletedAt: new Date().toISOString() })
      .where(
        and(
          eq(transactionItems.workspaceId, workspaceId),
          eq(transactionItems.transactionId, transactionId),
          eq(transactionItems.id, itemId),
          isNull(transactionItems.deletedAt),
        ),
      )
      .returning();
    return result;
  }

  static async search(workspaceId: string, query: string, limit: number) {
    return db
      .select({
        id: transactionItems.id,
        transactionId: transactionItems.transactionId,
        name: transactionItems.name,
        brand: transactionItems.brand,
        amount: transactionItems.amount,
        quantity: transactionItems.quantity,
        unit: transactionItems.unit,
        createdAt: transactionItems.createdAt,
      })
      .from(transactionItems)
      .where(
        and(
          eq(transactionItems.workspaceId, workspaceId),
          isNull(transactionItems.deletedAt),
          or(
            ilike(transactionItems.name, `%${query}%`),
            ilike(transactionItems.brand, `%${query}%`),
          ) as any,
        ),
      )
      .orderBy(desc(transactionItems.createdAt))
      .limit(limit);
  }
}
