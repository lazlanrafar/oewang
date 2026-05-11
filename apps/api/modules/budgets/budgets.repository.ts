import { db, budgets, transactions, categories } from "@workspace/database";
import { and, eq, isNull, sql, gte, lte } from "drizzle-orm";
import type { BudgetStatus } from "@workspace/types";

export abstract class BudgetsRepository {
  static async create(data: typeof budgets.$inferInsert) {
    const [result] = await db.insert(budgets).values(data).returning();
    return result;
  }

  static async findAll(workspaceId: string) {
    return db
      .select()
      .from(budgets)
      .where(and(eq(budgets.workspaceId, workspaceId), isNull(budgets.deletedAt)));
  }

  static async findById(id: string, workspaceId: string) {
    const [result] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.workspaceId, workspaceId), isNull(budgets.deletedAt)));
    return result;
  }

  static async findByCategory(categoryId: string, workspaceId: string) {
    const [result] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.categoryId, categoryId), eq(budgets.workspaceId, workspaceId), isNull(budgets.deletedAt)));
    return result;
  }

  static async update(id: string, workspaceId: string, data: Partial<typeof budgets.$inferInsert>) {
    const [result] = await db
      .update(budgets)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(budgets.id, id), eq(budgets.workspaceId, workspaceId), isNull(budgets.deletedAt)))
      .returning();
    return result;
  }

  static async delete(id: string, workspaceId: string) {
    const [result] = await db
      .update(budgets)
      .set({ deletedAt: new Date() })
      .where(and(eq(budgets.id, id), eq(budgets.workspaceId, workspaceId), isNull(budgets.deletedAt)))
      .returning();
    return result;
  }

  static async getStatus(workspaceId: string, startDate: string, endDate: string): Promise<BudgetStatus[]> {
    const results = await db
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        categoryName: categories.name,
        amount: budgets.amount,
        spent: sql<string>`coalesce(sum(${transactions.amount}), '0')`,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .leftJoin(
        transactions,
        and(
          eq(budgets.categoryId, transactions.categoryId),
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.type, "expense"),
          gte(transactions.date, startDate),
          lte(transactions.date, endDate),
          isNull(transactions.deletedAt),
        ),
      )
      .where(and(eq(budgets.workspaceId, workspaceId), isNull(budgets.deletedAt)))
      .groupBy(budgets.id, categories.id);

    return results.map((row) => {
      const amount = Number(row.amount);
      const spent = Number(row.spent);
      return {
        id: row.id,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        amount,
        spent,
        percentage: amount > 0 ? Math.round((spent / amount) * 100) : 0,
      };
    });
  }
}
