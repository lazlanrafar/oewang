import {
  db,
  transactions,
  categories,
  and,
  eq,
  isNull,
  gte,
  lte,
  sql,
} from "@workspace/database";

export abstract class MetricsRepository {
  static async getMonthlyTotalsByType(
    workspaceId: string,
    type: "income" | "expense",
    startDate: Date,
    endDate: Date,
  ) {
    const result = await db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${transactions.date}::timestamp), 'Mon ''YY')`,
        total: sql<number>`SUM(${transactions.amount})`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.type, type),
          gte(transactions.date, startDate.toISOString()),
          lte(transactions.date, endDate.toISOString()),
          isNull(transactions.deletedAt),
        ),
      )
      .groupBy(sql`date_trunc('month', ${transactions.date}::timestamp)`)
      .orderBy(sql`date_trunc('month', ${transactions.date}::timestamp)`);

    return result;
  }

  static async getCategoryBreakdown(
    workspaceId: string,
    type: "income" | "expense",
    startDate: Date,
    endDate: Date,
  ) {
    const result = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: sql<string>`COALESCE(MAX(${categories.name}), 'Uncategorized')`,
        total: sql<number>`SUM(${transactions.amount})`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.type, type),
          gte(transactions.date, startDate.toISOString()),
          lte(transactions.date, endDate.toISOString()),
          isNull(transactions.deletedAt),
        ),
      )
      .groupBy(transactions.categoryId)
      .orderBy(sql`SUM(${transactions.amount}) DESC`);

    return result;
  }
}
